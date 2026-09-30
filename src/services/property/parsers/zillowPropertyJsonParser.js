// services/property/parsers/zillowPropertyJsonParser.js
//
// Reads Zillow's structured property object from the Firecrawl RAW HTML scrape
// (<script id="__NEXT_DATA__"> -> props.pageProps.componentProps.gdpClientCache)
// and returns it in the SAME shape as zillowDetailsParser.extractFromMarkdown,
// so the importer can merge the two.
//
// This JSON is Zillow's first-load data: reliable for the core facts (address,
// beds, baths, sqft, lot, price, Zestimates, HOA, agent, coordinates) but it
// usually has no schools / price history / tax history. Those come from the
// markdown scrape.
//
// Usage: parseZillowPropertyJson(firecrawlJson | rawHtmlString) -> parsed | null

const NEXT_DATA_RE = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
const SQFT_PER_ACRE = 43560;

const isBlank = (v) => v === null || v === undefined || v === "";

function toNum(v) {
    if (isBlank(v)) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
}

/** ["Central", "Forced Air"] -> "Central, Forced Air"; strings pass through. */
function toText(v) {
    if (Array.isArray(v)) {
        const joined = v.map((x) => (isBlank(x) ? "" : String(x).trim())).filter(Boolean).join(", ");
        return joined || null;
    }
    return isBlank(v) ? null : String(v).trim();
}

function yearOf(v) {
    if (isBlank(v)) return null;
    const d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
    const y = d.getUTCFullYear();
    return Number.isFinite(y) ? y : null;
}

function getRawHtml(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    return payload.data?.rawHtml || payload.rawHtml || "";
}

/**
 * The raw Zillow property object, or null when the page has none.
 * @param {object|string} payload  Firecrawl response or raw HTML string.
 */
function extractZillowProperty(payload) {
    const match = getRawHtml(payload).match(NEXT_DATA_RE);
    if (!match) return null;

    try {
        const nextData = JSON.parse(match[1]);
        let cache = nextData?.props?.pageProps?.componentProps?.gdpClientCache;
        if (typeof cache === "string") cache = JSON.parse(cache);
        if (!cache || typeof cache !== "object") return null;

        const entry = Object.values(cache).find((v) => v && typeof v.property === "object" && v.property);
        return entry ? entry.property : null;
    } catch {
        return null;
    }
}

/** Lot size in square feet from lotAreaValue + lotAreaUnits, else the numeric lotSize. */
function lotSizeSqft(p) {
    const value = toNum(p.lotAreaValue);
    const units = String(p.lotAreaUnits || "").toLowerCase();
    if (value != null && units.includes("acre")) return Math.round(value * SQFT_PER_ACRE);
    if (value != null && units.includes("sq")) return Math.round(value);
    return typeof p.lotSize === "number" ? p.lotSize : null;
}

function mapSchools(schools) {
    return (Array.isArray(schools) ? schools : [])
        .filter((s) => s && s.name)
        .map((s) => ({
            name: s.name,
            grades: s.grades || null,
            distance: s.distance != null ? `${s.distance} mi` : null,
            rating: toNum(s.rating),
            level: s.level || "",
            type: /private/i.test(s.type || "") ? "Private" : "Public",
        }));
}

function mapPriceHistory(history) {
    return (Array.isArray(history) ? history : [])
        .filter(Boolean)
        .map((e) => ({
            date: e.date || null,
            year: yearOf(e.date ?? e.time),
            event: e.event || "",
            price: toNum(e.price),
            pricePerSqft: toNum(e.pricePerSquareFoot),
        }))
        .filter((e) => e.year != null || e.price != null);
}

function mapTaxHistory(history) {
    return (Array.isArray(history) ? history : [])
        .filter(Boolean)
        .map((e) => ({
            year: yearOf(e.time ?? e.year),
            propertyTax: toNum(e.taxPaid),
            taxAssessment: toNum(e.value),
        }))
        .filter((e) => e.year != null);
}

function mapListingAgent(info) {
    if (!info || !info.agentName) return null;
    return {
        name: String(info.agentName).trim(),
        licenseNumber: info.agentLicenseNumber || null,
        phone: info.agentPhoneNumber || null,
        company: info.brokerName ? String(info.brokerName).replace(/,\s*$/, "").trim() : null,
    };
}

/**
 * Zillow property object -> the markdown parser's shape. Missing values are
 * null / [] — nothing is guessed.
 */
function toParsedShape(p) {
    const reso = p.resoFacts || {};
    const street = p.streetAddress || p.address?.streetAddress || null;
    const city = p.city || p.address?.city || null;
    const state = p.state || p.address?.state || null;
    const zipCode = p.zipcode || p.address?.zipcode || null;
    const lat = toNum(p.latitude);
    const lng = toNum(p.longitude);

    return {
        price: toNum(p.price),
        address: {
            fullAddress: street && city && state && zipCode ? `${street}, ${city}, ${state} ${zipCode}` : null,
            street,
            city,
            state,
            zipCode,
        },
        coordinates: lat != null && lng != null ? { lat, lng } : null,
        specs: {
            beds: toNum(p.bedrooms ?? reso.bedrooms),
            baths: toNum(p.bathrooms ?? reso.bathrooms),
            sqft: toNum(p.livingArea ?? p.livingAreaValue),
            lotSizeSqft: lotSizeSqft(p),
            yearBuilt: toNum(p.yearBuilt ?? reso.yearBuilt),
            stories: toNum(reso.stories),
        },
        financials: {
            monthlyHoa: toNum(p.monthlyHoaFee ?? reso.hoaFee),
            taxAssessedValue: toNum(reso.taxAssessedValue),
            zestimate: toNum(p.zestimate),
            rentZestimate: toNum(p.rentZestimate),
            pricePerSqft: toNum(reso.pricePerSquareFoot),
        },
        details: {
            apn: toText(reso.parcelNumber),
            heating: toText(reso.heating),
            cooling: toText(reso.cooling),
            parking: toText(reso.parkingFeatures),
            totalParkingSpaces: toNum(reso.parkingCapacity),
            garageSpaces: toNum(reso.garageParkingCapacity),
            fireplaceCount: toNum(reso.fireplaces),
            fireplaceFeatures: toText(reso.fireplaceFeatures),
            foundation: toText(reso.foundationDetails),
            roof: toText(reso.roofType),
            zoning: toText(reso.zoning),
            sewer: toText(reso.sewer),
            water: toText(reso.waterSource),
            specialConditions: toText(reso.specialListingConditions),
            listingAgreement: toText(reso.listingTerms),
            dateOnMarket: null,
            homeType: toText(reso.homeType ?? p.homeType),
        },
        description: typeof p.description === "string" && p.description.trim() ? p.description.trim() : null,
        schools: mapSchools(p.schools),
        priceHistory: mapPriceHistory(p.priceHistory),
        taxHistory: mapTaxHistory(p.taxHistory),
        foreclosureHistory: [],
        walkScores: { walkScore: null, bikeScore: null, transitScore: null },
        listingAgent: mapListingAgent(p.attributionInfo),
        mlsNumber: p.attributionInfo?.mlsId || p.mlsid || null,
        mlsSource: p.attributionInfo?.mlsName || null,
        marketActivity: {
            daysOnMarket: toNum(p.daysOnZillow),
            views: toNum(p.pageViewCount),
            saves: toNum(p.favoriteCount),
        },
    };
}

/** Firecrawl raw-HTML payload -> parsed shape, or null when no property JSON is found. */
function parseZillowPropertyJson(payload) {
    const property = extractZillowProperty(payload);
    return property ? toParsedShape(property) : null;
}

module.exports = { parseZillowPropertyJson, extractZillowProperty };
