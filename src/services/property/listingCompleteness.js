// services/property/listingCompleteness.js
//
// The checklist a scraped market data listing is held to, and the "fill only the gaps" merge used when a
// listing is scraped again. Zillow pages load in pieces, so one scrape can miss a section (facts, tax
// history, the "Listed by" block) that is on the page. That silently cost us the APN on 8206 Loma Vista Pl,
// the tax history on the same home and the agent license on 960 Larrabee St (Nov 2026).
//
// fetchMarketDataListing (propertyImportService) scrapes, checks this list, re-scrapes while a RETRY field
// is missing, and fills only the empty spots from each new scrape. Whatever is still missing after the
// last try is reported to the admin by name instead of being left blank without a word.

const isEmpty = (v) =>
    v === null ||
    v === undefined ||
    (typeof v === "string" && v.trim() === "") ||
    (typeof v === "number" && !Number.isFinite(v)) ||
    (Array.isArray(v) && v.length === 0);

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

/**
 * `primary` with its empty spots (null / "" / [] / NaN) filled from `secondary`. Objects merge key by key;
 * a filled value in `primary` always wins — except lists, where the longer one wins: a half-loaded scrape
 * gives the first 3 tax rows from the HTML, a later full one the whole table. Pure.
 */
function fillGaps(primary, secondary) {
    if (Array.isArray(primary) && Array.isArray(secondary)) return secondary.length > primary.length ? secondary : primary;
    if (isPlainObject(primary) || isPlainObject(secondary)) {
        const a = isPlainObject(primary) ? primary : {};
        const b = isPlainObject(secondary) ? secondary : {};
        if (!isPlainObject(primary) && !isEmpty(primary)) return primary;
        const out = { ...a };
        Object.keys(b).forEach((k) => {
            out[k] = fillGaps(a[k], b[k]);
        });
        return out;
    }
    return isEmpty(primary) ? (isEmpty(secondary) ? primary ?? secondary ?? null : secondary) : primary;
}

// Sold / off-market / rental pages carry far less (no price, often no agent), so they aren't retried.
// Same rule the parser uses for the price (marketDataPropertyJsonParser.isNotForSale).
const { isNotForSale } = require("./parsers/marketDataPropertyJsonParser");

/**
 * key    : stable id (used by tests and logs)
 * label  : what the admin reads in the warning
 * get    : the value in the merged listing (marketData) + photo URLs
 * retry  : true when the source normally has it, so a gap is worth another scrape
 * when   : optional — only checked when this returns true
 */
const CHECKS = [
    { key: "street", label: "street address", get: (m) => m.address?.street, retry: true },
    { key: "city", label: "city", get: (m) => m.address?.city, retry: true },
    { key: "zipCode", label: "ZIP code", get: (m) => m.address?.zipCode, retry: true },
    { key: "price", label: "list price", get: (m) => m.price, retry: true, when: (m) => isForSale(m) },
    { key: "beds", label: "bedrooms", get: (m) => m.specs?.beds, retry: true },
    { key: "baths", label: "bathrooms", get: (m) => m.specs?.baths, retry: true },
    { key: "sqft", label: "living area (sq ft)", get: (m) => m.specs?.sqft, retry: true },
    { key: "yearBuilt", label: "year built", get: (m) => m.specs?.yearBuilt, retry: true },
    { key: "lotSize", label: "lot size", get: (m) => m.specs?.lotSizeSqft, retry: false },
    { key: "homeType", label: "home type", get: (m) => m.details?.homeType, retry: true },
    { key: "apn", label: "APN (parcel number)", get: (m) => m.details?.apn, retry: true },
    { key: "description", label: "description", get: (m) => m.description, retry: true },
    // Comes from the page JSON, which is complete on every scrape — a re-scrape never finds a missing one
    // (live test, Nov 2026: 3 tries each on homes Zillow has no Rent Zestimate for).
    { key: "rentEstimate", label: "rent estimate", get: (m) => m.financials?.rentEstimate, retry: false },
    { key: "estimate", label: "home value estimate", get: (m) => m.financials?.estimate, retry: false },
    { key: "taxHistory", label: "tax history", get: (m) => m.taxHistory, retry: true },
    // A home for sale has at least its "Listed for sale" row, so an empty list means the scrape missed it.
    { key: "priceHistory", label: "price history", get: (m) => m.priceHistory, retry: true, when: (m) => isForSale(m) },
    { key: "coordinates", label: "map location", get: (m) => m.coordinates, retry: true },
    { key: "agentName", label: "listing agent", get: (m) => m.listingAgent?.name, retry: true, when: (m) => isForSale(m) },
    {
        key: "agentLicense",
        label: "listing agent license #",
        get: (m) => m.listingAgent?.licenseNumber,
        // California listings must show the agent's DRE number, and Zillow shows it there.
        retry: true,
        when: (m) => isForSale(m) && !isEmpty(m.listingAgent?.name) && /^CA$/i.test(String(m.address?.state || "")),
    },
    { key: "photos", label: "photos", get: (_m, photoUrls) => photoUrls, retry: true },
    { key: "schools", label: "schools", get: (m) => m.schools, retry: false },
];

function isForSale(m) {
    return !isNotForSale(m?.homeStatus);
}

/**
 * The checklist items missing from a merged listing.
 * @returns {{ key:string, label:string, retry:boolean }[]}
 */
function missingFields(marketData, photoUrls = []) {
    const m = marketData || {};
    return CHECKS.filter((c) => (!c.when || c.when(m)) && isEmpty(c.get(m, photoUrls))).map(({ key, label, retry }) => ({
        key,
        label,
        retry,
    }));
}

/** True when another scrape is worth it: the page is for sale and a RETRY field is missing. */
const worthRetry = (marketData, missing) => isForSale(marketData) && missing.some((f) => f.retry);

module.exports = { CHECKS, missingFields, fillGaps, worthRetry, isEmpty, isForSale };
