// services/propStreamParserService.js
//
// Parses a PropStream "Comparative Market Analysis" PDF into a normalized,
// productModel-shaped partial.
//
// IMPORTANT — how PropStream's PDF text actually extracts:
//   pdf-parse concatenates columns with NO separators, and the summary block is
//   VALUE-then-LABEL ("$376,000Estimated Value:", "3Bedrooms:"), while the
//   public-record block is LABEL-then-VALUE ("Bedrooms:3", "Heating:Central").
//   Every regex below is written against the real byte stream, verified against
//   a live report, and anchored on unambiguous tokens ($ signs, dates, labels).
//
// Hard rule: NO invented data. Any field the report doesn't contain comes back
// null / [] — never a placeholder. The importer surfaces these as blanks.

const pdfParse = require("pdf-parse");

// ---------------------------------------------------------------------------
// Small parse helpers
// ---------------------------------------------------------------------------

/** "$1,708" | "1,386" | "-$44,800" -> 1708 | 1386 | -44800 (null if absent). */
function toNumber(raw) {
    if (raw === undefined || raw === null) return null;
    const cleaned = String(raw).replace(/[^0-9.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/** "6/08/26" | "08/24/2026" -> Date (null if unparseable). */
function toDate(raw) {
    if (!raw) return null;
    const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    let [, mm, dd, yy] = m;
    let year = Number(yy);
    if (yy.length === 2) year += year < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** First capture group of the first matching regex, trimmed; null if none. */
function firstMatch(text, patterns) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    for (const re of list) {
        const m = text.match(re);
        if (m && m[1] !== undefined) return m[1].trim();
    }
    return null;
}

/** Map PropStream "Property Type" wording -> productModel enum, or null. */
function mapPropertyType(raw) {
    if (!raw) return null;
    const v = raw.toLowerCase();
    if (v.includes("single family") || v.includes("sfr")) return "Single Family";
    if (v.includes("condo") || v.includes("townhouse") || v.includes("town house")) {
        return "Condo, Townhouse, other single unit";
    }
    if (v.includes("multi")) return "Multi-family";
    if (v.includes("land") || v.includes("vacant land")) return "Land";
    return null;
}

/** "Owner Occupied" | "Vacant" -> productModel occupancy enum, or null. */
function mapOccupancy(raw) {
    if (!raw) return null;
    const v = raw.toLowerCase();
    if (v.includes("vacant") && v.includes("report")) return "Reported Vacant";
    if (v.includes("vacant")) return "Vacant";
    if (v.includes("occupied")) return "Occupied";
    return null;
}

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------
function parseAddress(text) {
    const headerLine = firstMatch(text, [
        /Comparative Market Analysis\s*\n\s*([^\n]+?,\s*[A-Za-z .]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)/i,
        /Subject Property:\s*([^\n]+?,\s*[A-Za-z .]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)/i,
    ]);
    let candidate = headerLine;
    if (!candidate) {
        candidate = firstMatch(text, /SITUS ADDRESS OF\s+([^,]+,\s*[A-Za-z .]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)/i);
    }
    if (!candidate) return { street: null, city: null, state: null, zipCode: null };

    const m = candidate.match(/^(.*?),\s*([A-Za-z .]+),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$/);
    if (!m) return { street: candidate.trim(), city: null, state: null, zipCode: null };

    const titleCase = (s) =>
        s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    return {
        street: titleCase(m[1].trim()),
        city: titleCase(m[2].trim()),
        state: m[3].toUpperCase(),
        zipCode: m[4],
    };
}

// ---------------------------------------------------------------------------
// Comparables — the clean sold-comps table ("COMPARABLES", letters A–S).
// Row byte stream (no separators), e.g.:
//   A0.071490 Tamarack Ave, Atwater, Ca 953016/08/26$375,0001,572$23938,075712
//   = Ltr MI Address SoldDate $SoldPrice Sqft $PPSF Beds Lot Age Baths
// Anchors: the two '$' signs and the date bound the numeric fields reliably.
// Rows that don't cleanly match are skipped (never guessed).
// ---------------------------------------------------------------------------
function parseComparables(text) {
    const start = text.search(/\bCOMPARABLES\b/);
    if (start === -1) return [];
    const rest = text.slice(start);
    const endIdx = rest.search(/NEARBY LISTINGS|L:\s*Listed\s+F:\s*Foreclosure|A:\s*Active/);
    const block = endIdx === -1 ? rest : rest.slice(0, endIdx);

    // Ltr, MI, Address(…ST ZIP), Date, $SoldPrice, Sqft, $PPSF, Beds, Lot, Age, Baths
    const rowRe = /^[A-Z]\s*\d+(?:\.\d{1,2})?\s*(.+?,\s*[A-Za-z]{2}\s*\d{5})\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\$([\d,]+?)(\d,\d{3})\$(\d{2,3})(\d)(\d{1,2},\d{3})(\d{2})(\d)$/;

    const out = [];
    for (const line of block.split("\n")) {
        const t = line.trim();
        if (!/^[A-Z]\s*\d/.test(t)) continue;
        const m = t.match(rowRe);
        if (!m) continue;
        out.push({
            address: m[1].trim().replace(/,\s*([A-Za-z]{2})\s+(\d{5})/, (s, st, zip) => `, ${st.toUpperCase()} ${zip}`),
            saleDate: toDate(m[2]),
            salePrice: toNumber(m[3]),
            sqft: toNumber(m[4]),
            pricePerSqft: toNumber(m[5]),
            beds: toNumber(m[6]),
            baths: toNumber(m[9]),
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
// propertyDetails (public-record facts present in the CMA)
// ---------------------------------------------------------------------------
function buildPropertyDetails(f) {
    const interiorFeatures = [];
    if (f.stories) interiorFeatures.push(`${f.stories} ${f.stories === 1 ? "Story" : "Stories"}`);
    if (f.fireplace) interiorFeatures.push(`${f.fireplace} Fireplace${f.fireplace === 1 ? "" : "s"}`);
    if (f.totalRooms) interiorFeatures.push(`${f.totalRooms} Total Rooms`);

    const parking = [];
    if (f.parkingSpaces) parking.push(`${f.parkingSpaces} Parking Spaces`);
    if (f.parkingType) parking.push(f.parkingType);

    const lotFeatures = [];
    if (f.lotSize) lotFeatures.push(`${f.lotSize.toLocaleString()} SqFt Lot`);

    const constructionFeatures = [];
    if (f.landUse) constructionFeatures.push(f.landUse);
    if (f.exteriorWall) constructionFeatures.push(`Exterior Wall: ${f.exteriorWall}`);
    if (f.zoning) constructionFeatures.push(`Zoning: ${f.zoning}`);

    return {
        interiorDetails: {
            bedroomsBathrooms: [],
            masterBathroom: [],
            rooms: [],
            heating: f.heating ? [f.heating] : [],
            cooling: f.cooling ? [f.cooling] : [],
            interiorFeatures,
        },
        exteriorDetails: {
            parking,
            lotFeatures,
            exteriorFeatures: [],
            constructionFeatures,
        },
        community: { communityInfo: [], hoa: [] },
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function parsePropStreamPdf(buffer) {
    const { text } = await pdfParse(buffer);

    const address = parseAddress(text);
    const county = firstMatch(text, [
        /([A-Za-z]+)\s+County\s+Data as of/i,
        /COUNTY OF\s+([A-Za-z]+)/i,
    ]);
    const evaluatedDate = toDate(firstMatch(text, /Data as of:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i));

    const f = {
        apn: firstMatch(text, [/APN:\s*([0-9-]+)/i, /([0-9-]{6,})Assessor Parcel #:/i]),
        propertyTypeRaw: firstMatch(text, /Property Type:([^\n]+?)(?:Comparables|\n)/i),
        occupancyRaw: firstMatch(text, /Occupancy:([^\n]+?)(?:Property Type|\n)/i),

        // public-record block (label-first, value-adjacent)
        beds: toNumber(firstMatch(text, /Bedrooms:(\d+)/i)),
        baths: toNumber(firstMatch(text, /Bathrooms:(\d+)/i)),
        squareFootage: toNumber(firstMatch(text, [/Living Area:([\d,]+)\s*SqFt/i, /([\d,]+)Square Feet:/i])),
        lotSize: toNumber(firstMatch(text, /Lot Size:([\d,]+)\s*SqFt/i)),
        // value-first in both blocks
        yearBuilt: toNumber(firstMatch(text, /(\d{4})Year Built:/i)),

        stories: toNumber(firstMatch(text, /Stories:(\d+)/i)),
        fireplace: toNumber(firstMatch(text, /Fireplace:(\d+)/i)),
        totalRooms: toNumber(firstMatch(text, /Total Rooms:(\d+)/i)),
        parkingSpaces: toNumber(firstMatch(text, /Parking Spaces:(\d+)/i)),
        heating: firstMatch(text, /Heating:([^\n]+?)(?:Exterior Wall:|Cooling:|Total Rooms:|\n)/i),
        cooling: firstMatch(text, /Cooling:([^\n]+?)(?:\n|Price|Open Liens)/i),
        parkingType: firstMatch(text, /Parking Type:([^\n]+?)(?:\n|Basement:|Interior)/i),
        exteriorWall: firstMatch(text, /Exterior Wall:([^\n]+?)(?:Bathrooms:|Price|Interior|\n)/i),
        landUse: firstMatch(text, /\n([A-Za-z][A-Za-z /]+?)Land Use:/i),
        zoning: firstMatch(text, /([A-Z0-9]+)Zoning:/),

        // summary block (value-first) + one label-first
        estimatedValue: toNumber(firstMatch(text, /\$([\d,]+)Estimated Value:/i)),
        monthlyRent: toNumber(firstMatch(text, /\$([\d,]+)Monthly Rent:/i)),
        avgSalePrice: toNumber(firstMatch(text, /Avg\.?\s*Sale Price:\$?([\d,]+)/i)),
        daysOnMarket: toNumber(firstMatch(text, /(\d+)Days on Market:/i)),

        // tax block
        landValue: toNumber(firstMatch(text, /Land Value:\$?([\d,]+)/i)),
        improvementValue: toNumber(firstMatch(text, /Improvement Value:\$?([\d,]+)/i)),
        totalTaxableValue: toNumber(firstMatch(text, /Total Taxable Value:\$?([\d,]+)/i)),
        propertyTax: toNumber(firstMatch(text, /Property Tax:\$?([\d,]+(?:\.\d+)?)/i)),
        taxYear: toNumber(firstMatch(text, [/(\d{4})Tax Year:/i, /Tax Year:\s*(\d{4})/i])),
    };

    const propertyType = mapPropertyType(f.propertyTypeRaw);
    const occupancyStatus = mapOccupancy(f.occupancyRaw);

    // Distressed / pre-foreclosure => assetType 'Foreclosure Homes' (else blank).
    const distressed =
        /Distressed:\s*Yes/i.test(text) ||
        /Notice of Trustee'?s Sale/i.test(text) ||
        /Pre-?Foreclosure/i.test(text);
    const assetType = distressed ? 'Foreclosure Homes' : '';
    const propertyDescription =
        firstMatch(text, /(A PARCEL OF LAND[\s\S]*?LOT:\s*\d+\.)/i) ||
        firstMatch(text, /Property Description:\s*([^\n]+)/i);

    const comparables = parseComparables(text);

    const parsed = {
        productName: address.street
            ? `${address.street}${address.city ? `, ${address.city}` : ""}${address.state ? `, ${address.state}` : ""}`
            : null,
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        county: county ? county.trim() : null,
        beds: f.beds,
        baths: f.baths,
        squareFootage: f.squareFootage,
        lotSize: f.lotSize,
        yearBuilt: f.yearBuilt,
        apn: f.apn,
        propertyType,
        occupancyStatus,
        assetType, // '' or 'Foreclosure Homes'
        estimatedValue: f.estimatedValue, // used to seed reserve/startBid
        // Raw legal blurb kept for reference; orchestrator writes the final,
        // human-readable propertyDescription (Gemini or template).
        legalDescription: propertyDescription ? propertyDescription.replace(/\s+/g, " ").trim() : null,
        propertyDescription: propertyDescription ? propertyDescription.replace(/\s+/g, " ").trim() : null,
        monthlyHOADues: 0, // no association data in this CMA; schema requires a Number

        propertyDetails: buildPropertyDetails(f),

        investmentData: {
            valuation: {
                ViharaValue: f.estimatedValue,
                highRange: null,
                lowRange: null,
                confidenceScore: null,
                evaluatedDate,
            },
            rental: {
                estimatedMonthlyRent: f.monthlyRent,
                estimatedAnnualRent: f.monthlyRent ? f.monthlyRent * 12 : null,
                rentalValue: f.monthlyRent,
                highRange: null,
                lowRange: null,
                averageRentalTrend: null,
                vacancyRate: null,
            },
            taxData: {
                annualPropertyTax: f.propertyTax,
                assessedValue: f.totalTaxableValue,
                assessmentYear: f.taxYear,
                landValue: f.landValue,
                improvementValue: f.improvementValue,
            },
            comparables,
            priceHistory: [],
            taxHistory:
                (f.taxYear || f.propertyTax || f.totalTaxableValue)
                    ? [{
                        year: f.taxYear,
                        propertyTax: f.propertyTax,
                        taxChange: "",
                        taxAssessment: f.totalTaxableValue,
                        assessmentChange: "",
                    }]
                    : [],
        },

        marketInsights: {
            medianListPrice: null,
            medianSoldPrice: f.avgSalePrice,
            daysOnMarket: f.daysOnMarket,
            salesListPrice: null,
            trends: { listPrice: null, soldPrice: null, daysOnMarket: null, salesRatio: null },
        },
    };

    const requiredCore = {
        street: parsed.street, city: parsed.city, county: parsed.county, state: parsed.state,
        zipCode: parsed.zipCode, beds: parsed.beds, baths: parsed.baths,
        squareFootage: parsed.squareFootage, lotSize: parsed.lotSize, yearBuilt: parsed.yearBuilt,
        apn: parsed.apn, propertyType: parsed.propertyType, propertyDescription: parsed.propertyDescription,
    };
    const missing = Object.keys(requiredCore).filter(
        (k) => requiredCore[k] === null || requiredCore[k] === undefined || requiredCore[k] === ""
    );

    return { parsed, missing, rawTextLength: text.length };
}

module.exports = { parsePropStreamPdf };
