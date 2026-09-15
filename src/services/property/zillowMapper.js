// services/zillowMapper.js
//
// Maps the raw Zillow property object (pulled from the page's __NEXT_DATA__ by
// the browser extractor) into productModel-shaped fragments the importer can
// merge onto a draft: schools, priceHistory, taxHistory, and propertyDetails
// enrichment.
//
// This is the FRAGILE layer: Zillow changes __NEXT_DATA__ periodically, so the
// browser extractor may need updates. Everything here is defensive — missing or
// oddly-shaped fields yield [] rather than throwing, and NOTHING is invented.

function toNum(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
}

function yearFrom(v) {
    if (v === null || v === undefined) return null;
    // epoch ms, epoch s, ISO date, or "YYYY-MM-DD"
    let d;
    if (typeof v === "number") d = new Date(v > 1e12 ? v : v * 1000);
    else d = new Date(v);
    const y = d.getFullYear();
    return Number.isFinite(y) ? y : null;
}

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---- schools ----
function mapSchools(schools) {
    const out = { public: [], private: [] };
    for (const s of asArray(schools)) {
        if (!s || !s.name) continue;
        const entry = {
            name: s.name,
            rating: s.rating != null ? `${s.rating}/10` : "",
            grades: s.grades || "",
            distance: s.distance != null ? `${s.distance} mi` : "",
        };
        const type = String(s.type || "").toLowerCase();
        if (type.includes("private")) out.private.push(entry);
        else out.public.push(entry); // public / charter / default
    }
    return out;
}

// ---- price history ----
function simplifyEvent(e) {
    const v = String(e || "").toLowerCase();
    if (v.includes("sold")) return "Sold";
    if (v.includes("listed")) return "Listed";
    if (v.includes("price")) return "Price change";
    if (v.includes("pending")) return "Pending";
    return e || "";
}
function mapPriceHistory(ph) {
    const out = [];
    for (const e of asArray(ph)) {
        if (!e) continue;
        const year = yearFrom(e.date ?? e.time);
        const price = toNum(e.price);
        if (year == null && price == null) continue;
        out.push({
            year,
            event: simplifyEvent(e.event),
            price,
            pricePerSqft: toNum(e.pricePerSquareFoot),
        });
    }
    return out;
}

// ---- tax history ----
function mapTaxHistory(th) {
    const out = [];
    for (const e of asArray(th)) {
        if (!e) continue;
        const year = yearFrom(e.time ?? e.year);
        if (year == null) continue;
        out.push({
            year,
            propertyTax: toNum(e.taxPaid),
            taxChange: e.taxIncreaseRate != null ? `${Math.round(e.taxIncreaseRate * 100) / 100}%` : "",
            taxAssessment: toNum(e.value),
            assessmentChange: e.valueIncreaseRate != null ? `${Math.round(e.valueIncreaseRate * 100) / 100}%` : "",
        });
    }
    return out;
}

// ---- propertyDetails enrichment from resoFacts + atAGlanceFacts ----
function strList(v) {
    return asArray(v).map((x) => (x && x.roomType ? x.roomType : String(x))).filter(Boolean);
}

// atAGlanceFacts is [{ factLabel, factValue }] — turn into a label->value map.
function glanceMap(atAGlanceFacts) {
    const m = {};
    for (const f of asArray(atAGlanceFacts)) {
        if (f && f.factLabel && f.factValue != null && f.factValue !== "") {
            m[String(f.factLabel).toLowerCase()] = String(f.factValue);
        }
    }
    return m;
}

function mapPropertyDetails(reso, atAGlanceFacts) {
    const g = glanceMap(atAGlanceFacts);
    if ((!reso || typeof reso !== "object") && Object.keys(g).length === 0) return null;
    reso = reso || {};

    // heating / cooling: prefer resoFacts, fall back to the glance facts
    const heating = strList(reso.heating);
    if (!heating.length && g["heating"]) heating.push(g["heating"]);
    const cooling = strList(reso.cooling);
    if (!cooling.length && g["cooling"]) cooling.push(g["cooling"]);

    const interiorFeatures = [
        ...strList(reso.interiorFeatures),
        ...strList(reso.flooring).map((f) => `Flooring: ${f}`),
        ...strList(reso.appliances).map((a) => `Appliance: ${a}`),
        ...strList(reso.laundryFeatures).map((l) => `Laundry: ${l}`),
        ...strList(reso.fireplaceFeatures).map((f) => `Fireplace: ${f}`),
        ...(reso.hasFireplace ? ["Has fireplace"] : []),
        ...(reso.stories ? [`${reso.stories} ${reso.stories === 1 ? "story" : "stories"}`] : []),
    ];
    if (!strList(reso.flooring).length && g["flooring"]) interiorFeatures.push(`Flooring: ${g["flooring"]}`);

    const parking = [
        ...strList(reso.parkingFeatures),
        ...(reso.garageParkingCapacity ? [`${reso.garageParkingCapacity} Garage Spaces`] : []),
    ];
    if (!parking.length && g["parking"]) parking.push(g["parking"]);

    const exteriorFeatures = [
        ...strList(reso.exteriorFeatures),
        ...strList(reso.patioAndPorchFeatures).map((p) => `Patio/Porch: ${p}`),
        ...strList(reso.poolFeatures).map((p) => `Pool: ${p}`),
        ...strList(reso.fencing).map((f) => `Fencing: ${f}`),
        ...strList(reso.view).map((v) => `View: ${v}`),
    ];

    const constructionFeatures = [
        ...strList(reso.propertySubType),
        ...strList(reso.constructionMaterials).map((c) => `Construction: ${c}`),
        ...strList(reso.roofType).map((r) => `Roof: ${r}`),
        ...strList(reso.foundationDetails).map((f) => `Foundation: ${f}`),
        ...(reso.architecturalStyle ? [`Style: ${reso.architecturalStyle}`] : []),
        ...(reso.waterSource ? strList(reso.waterSource).map((w) => `Water: ${w}`) : []),
        ...(reso.sewer ? strList(reso.sewer).map((s) => `Sewer: ${s}`) : []),
    ];

    const lotFeatures = [
        ...strList(reso.lotFeatures),
        ...(reso.lotSize && !strList(reso.lotFeatures).length ? [`${reso.lotSize} lot`] : []),
    ];

    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

    return {
        interior: {
            heating: uniq(heating),
            cooling: uniq(cooling),
            rooms: uniq(strList(reso.rooms)),
            interiorFeatures: uniq(interiorFeatures),
        },
        exterior: {
            parking: uniq(parking),
            lotFeatures: uniq(lotFeatures),
            exteriorFeatures: uniq(exteriorFeatures),
            constructionFeatures: uniq(constructionFeatures),
        },
    };
}

// ---- v3 scraper "facts" (flat label->value map) -> propertyDetails ----
// The v3 DOM scraper sends `facts` like { Heating:"Central Forced Air",
// Cooling:"Central Air", Roof:"Composition", Foundation:"Crawl Space", ... }.
function factsToDetails(facts) {
    if (!facts || typeof facts !== "object") return null;
    const g = {};
    Object.keys(facts).forEach((k) => { g[k.toLowerCase()] = String(facts[k]); });
    const clean = (v) => (v ? v.replace(/^(size|total spaces|features|type & style)\s*:\s*/i, "").trim() : "");

    const interiorFeatures = [];
    if (g["fireplace"]) interiorFeatures.push(`Fireplace: ${clean(g["fireplace"])}`);
    if (g["stories"]) interiorFeatures.push(`${clean(g["stories"])} ${clean(g["stories"]) === "1" ? "story" : "stories"}`);
    if (g["appliances"]) interiorFeatures.push(`Appliances: ${clean(g["appliances"])}`);

    const constructionFeatures = [];
    if (g["roof"]) constructionFeatures.push(`Roof: ${clean(g["roof"])}`);
    if (g["foundation"]) constructionFeatures.push(`Foundation: ${clean(g["foundation"])}`);
    if (g["construction"]) constructionFeatures.push(`Construction: ${clean(g["construction"])}`);
    if (g["zoning"]) constructionFeatures.push(`Zoning: ${clean(g["zoning"])}`);
    if (g["water"]) constructionFeatures.push(`Water: ${clean(g["water"])}`);
    if (g["sewer"]) constructionFeatures.push(`Sewer: ${clean(g["sewer"])}`);
    if (g["style"]) constructionFeatures.push(`Style: ${clean(g["style"])}`);

    return {
        interior: {
            heating: g["heating"] ? [clean(g["heating"])] : [],
            cooling: g["cooling"] ? [clean(g["cooling"])] : [],
            rooms: [],
            interiorFeatures: interiorFeatures.filter(Boolean),
        },
        exterior: {
            parking: g["parking"] ? [clean(g["parking"])] : [],
            lotFeatures: g["lot"] ? [clean(g["lot"])] : [],
            exteriorFeatures: g["view"] ? [`View: ${clean(g["view"])}`] : [],
            constructionFeatures: constructionFeatures.filter(Boolean),
        },
    };
}

// ---- v3 scraper "value" -> valuation range / rental / walkScores / assetType ----
function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
}
function mapValue(value) {
    if (!value || typeof value !== "object") {
        return { valuationRange: null, rentZestimate: null, walkScores: null };
    }
    const walk = num(value.walkScore), bike = num(value.bikeScore), transit = num(value.transitScore);
    return {
        valuationRange:
            value.zestimateLow != null || value.zestimateHigh != null
                ? { high: num(value.zestimateHigh), low: num(value.zestimateLow) }
                : null,
        rentZestimate: num(value.rentZestimate),
        walkScores:
            walk != null || bike != null || transit != null
                ? { walk: walk, bike: bike, transit: transit }
                : null,
    };
}

// "RealEstateOwned" (Zillow special conditions) -> productModel assetType.
function assetTypeFromFacts(facts) {
    if (!facts || typeof facts !== "object") return null;
    const sc = String(facts["Special conditions"] || facts["special conditions"] || "").toLowerCase();
    if (sc.includes("realestateowned") || sc.includes("reo") || sc.includes("bank owned")) return "Reo Bank Owned";
    if (sc.includes("short")) return "Short Sale";
    if (sc.includes("foreclos") || sc.includes("auction")) return "Foreclosure Homes";
    return null;
}

/**
 * @param {object} zillow  Raw structured object from the browser extractor.
 *   v2 shape: { schools, priceHistory, taxHistory, resoFacts, atAGlanceFacts, description }
 *   v3 shape: { schools, priceHistory, taxHistory, facts, value, description }
 * @returns mapped fragments the importer merges onto a draft (PDF-priority).
 */
function mapZillowData(zillow) {
    if (!zillow || typeof zillow !== "object") {
        return {
            schools: null, priceHistory: [], taxHistory: [], propertyDetails: null,
            description: null, valuationRange: null, rentZestimate: null, walkScores: null, assetType: null,
        };
    }
    // propertyDetails: prefer v3 flat `facts`; fall back to v2 resoFacts/atAGlanceFacts.
    const propertyDetails = zillow.facts
        ? factsToDetails(zillow.facts)
        : mapPropertyDetails(zillow.resoFacts, zillow.atAGlanceFacts);

    const v = mapValue(zillow.value);

    return {
        schools: mapSchools(zillow.schools),
        priceHistory: mapPriceHistory(zillow.priceHistory),
        taxHistory: mapTaxHistory(zillow.taxHistory),
        propertyDetails,
        description: typeof zillow.description === "string" ? zillow.description.trim() : null,
        valuationRange: v.valuationRange,
        rentZestimate: v.rentZestimate,
        walkScores: v.walkScores,
        assetType: assetTypeFromFacts(zillow.facts),
    };
}

module.exports = { mapZillowData };
