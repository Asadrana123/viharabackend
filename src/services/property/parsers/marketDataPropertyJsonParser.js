// services/property/parsers/marketDataPropertyJsonParser.js
//
// Reads the source's structured property object from the Firecrawl RAW HTML scrape
// (<script id="__NEXT_DATA__"> -> props.pageProps.componentProps.gdpClientCache)
// and returns it in the SAME shape as marketDataDetailsParser.extractFromMarkdown,
// so the importer can merge the two.
//
// This JSON is the source's first-load data: reliable for the core facts (address,
// beds, baths, sqft, lot, price, estimates, HOA, agent, coordinates) but it
// usually has no schools / price history / tax history. Those come from the
// markdown scrape.
//
// Usage: parseMarketDataPropertyJson(firecrawlJson | rawHtmlString) -> parsed | null

const NEXT_DATA_RE = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
const SQFT_PER_ACRE = 43560;

// Market data homeStatus values where the page has no real asking price (the
// "price" field then holds a sold price or an estimate, not a list price).
const NOT_FOR_SALE_STATUS = /SOLD|OTHER|OFF_MARKET|RENT/i;

/** True when the source's status means there is no current list price. */
function isNotForSale(homeStatus) {
    return typeof homeStatus === "string" && NOT_FOR_SALE_STATUS.test(homeStatus);
}

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
 * The raw market data property object, or null when the page has none.
 * @param {object|string} payload  Firecrawl response or raw HTML string.
 */
function extractMarketDataProperty(payload) {
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
 * Market data property object -> the markdown parser's shape. Missing values are
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

    const homeStatus = typeof p.homeStatus === "string" && p.homeStatus.trim() ? p.homeStatus.trim() : null;

    return {
        // Only a real asking price — sold / off-market pages have none.
        price: isNotForSale(homeStatus) ? null : toNum(p.price),
        homeStatus,
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
            estimate: toNum(p.zestimate),
            rentEstimate: toNum(p.rentZestimate),
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
function parseMarketDataPropertyJson(payload) {
    const property = extractMarketDataProperty(payload);
    return property ? toParsedShape(property) : null;
}

module.exports = { parseMarketDataPropertyJson, extractMarketDataProperty, isNotForSale };
