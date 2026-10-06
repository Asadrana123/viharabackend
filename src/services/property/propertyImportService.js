// services/property/propertyImportService.js
//
// Orchestrates the property importer end to end:
//   1. Scrape the Zillow listing through Firecrawl (markdown + raw HTML, in parallel).
//   2. Parse the raw HTML's property JSON (core facts) and the markdown (facts,
//      schools, price/tax history), merge them, and read photo URLs from the raw HTML.
//   3. Upload the photos to Cloudinary.
//   4. Assemble a complete productModel-shaped DRAFT — with the auction business
//      fields defaulted / left blank for the admin to fill.
//
// Every Zillow money figure is shifted by the property's fixed -2%..+2%
// (priceTweakService), and the starting bid is 90% of the shifted list price.
//
// This never writes to the database. It returns a draft object that the admin
// edits in the importer tab and then submits to the existing
// POST /api/v1/product/bulk endpoint.
//
// fetchZillowListing / buildZillowDataFields / uploadListingImages are shared
// with the weekly sync (zillowSyncService), so both read Zillow the same way.

const Errorhandler = require("../../utils/errorhandler");
const firecrawlService = require("../integrations/firecrawlService");
const cloudinaryService = require("../shared/cloudinaryService");
const { processZillowResponse } = require("./parsers/zillowDetailsParser");
const { parseZillowPropertyJson, isNotForSale } = require("./parsers/zillowPropertyJsonParser");
const { extractZillowImages } = require("./parsers/zillowImageParser");
const { generatePropertyDescription } = require("./propertyDescriptionService");
const { createTweakPercent, tweakAmount } = require("./priceTweakService");
const crypto = require("crypto");

// Starting bid = this share of the (tweaked) Zillow list price.
const START_BID_RATIO = 0.9;

// productModel fields that are required but Zillow may not provide.
const REQUIRED_CORE_FIELDS = [
    "street", "city", "state", "zipCode", "beds", "baths",
    "squareFootage", "lotSize", "yearBuilt", "apn", "propertyType",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const isBlank = (v) => v === null || v === undefined || v === "";
const compact = (arr) => arr.filter((v) => !isBlank(v));
const firstFilled = (...values) => values.find((v) => !isBlank(v)) ?? null;

/** "4/15/2021" -> 2021 */
function yearFromDate(date) {
    const m = String(date || "").match(/(\d{4})\s*$/);
    return m ? Number(m[1]) : null;
}

/** 7 -> "7/10"; strings pass through. productModel stores rating as String. */
function formatSchoolRating(rating) {
    if (isBlank(rating)) return null;
    return typeof rating === "number" ? `${rating}/10` : String(rating);
}

/** Zillow special conditions / foreclosure history -> productModel assetType enum. */
function mapAssetType(zillow) {
    const conditions = String(zillow.details?.specialConditions || "").toLowerCase();
    // Zillow writes "RealEstateOwned" (no spaces).
    if (/real\s*estate\s*owned|bank\s*owned|\breo\b/.test(conditions)) return "Reo Bank Owned";
    if (/short sale/.test(conditions)) return "Short Sale";
    if (/foreclos|trustee/.test(conditions) || zillow.foreclosureHistory?.length) return "Foreclosure Homes";
    return "";
}

/** Zillow home type ("SingleFamily", "SINGLE_FAMILY", "Condo", ...) -> productModel propertyType enum. */
function mapPropertyType(homeType) {
    const t = String(homeType || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!t) return null;
    if (t.includes("singlefamily")) return "Single Family";
    if (t.includes("multifamily")) return "Multi-family";
    if (/condo|townhouse|townhome|cooperative|apartment/.test(t)) return "Condo, Townhouse, other single unit";
    if (/lot|land/.test(t)) return "Land";
    return null;
}

/** Accepts { lat, lng } or { latitude, longitude }. */
function mapCoordinates(coords) {
    if (!coords) return null;
    const lat = coords.lat ?? coords.latitude;
    const lng = coords.lng ?? coords.longitude;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
    return { parcel: { lat: Number(lat), lng: Number(lng) }, sourceData: "parcel" };
}

/** Turn a street/city into a stable Cloudinary folder key. */
function folderKeyFor({ street, city }) {
    const base = `${street || "property"} ${city || ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || "property";
}

/** Short stable fingerprint of Zillow's photo list (order matters: first = main photo). */
function photoSignatureFor(photoUrls) {
    if (!photoUrls.length) return null;
    return crypto.createHash("sha1").update(photoUrls.join("|")).digest("hex");
}

/** 90% of the tweaked list price, whole dollars; null without a list price. */
function startBidFrom(listPrice, tweakPercent) {
    const tweaked = tweakAmount(listPrice, tweakPercent);
    return typeof tweaked === "number" ? Math.round(tweaked * START_BID_RATIO) : null;
}

// Auction business terms. The two DATES are left for the admin to fill;
// everything else is seeded or defaulted.
//   - reservePrice            : seeded from the (tweaked) Zestimate, else list price — editable
//   - startBid                : 90% of the (tweaked) list price. null when Zillow shows
//                               no list price (e.g. off-market) — the admin must fill it.
//                               Callers that don't pass startBid keep the old behaviour.
//   - minIncrement            : 1000 default
//   - emd / commission        : 0 default
//   - eventID / trusteeSale   : 'TBD'
//   - onlineOrInPerson        : 'Online' default
//   - start/end TIME          : hidden defaults (schema requires the strings)
function auctionDefaults(parsed) {
    const estVal = parsed?.estimatedValue ?? parsed?.investmentData?.valuation?.ViharaValue ?? null;
    return {
        auctionStartDate: null,      // admin fills
        auctionStartTime: "9:00 AM", // hidden default
        auctionEndDate: null,        // admin fills
        auctionEndTime: "5:00 PM",   // hidden default
        reservePrice: estVal ?? 0,
        minIncrement: 1000,
        emd: 0,
        commission: 0,
        startBid: parsed?.startBid !== undefined ? parsed.startBid : estVal ?? 0,
        eventID: "TBD",
        trusteeSaleNumber: "TBD",
        onlineOrInPerson: "Online",
        assetType: parsed?.assetType || "",
    };
}

// ---------------------------------------------------------------------------
// Merge the two parsed sources (same shape)
//   - JSON first for core facts: it is Zillow's own structured data.
//   - Markdown first for facts & features, schools and history: the JSON's
//     first-load data usually doesn't include them.
// Each value falls back to the other source when blank.
// ---------------------------------------------------------------------------
function mergeFields(primary, fallback) {
    const out = {};
    new Set([...Object.keys(primary || {}), ...Object.keys(fallback || {})]).forEach((key) => {
        out[key] = firstFilled(primary?.[key], fallback?.[key]);
    });
    return out;
}

const nonEmptyList = (primary, fallback) =>
    Array.isArray(primary) && primary.length ? primary : Array.isArray(fallback) ? fallback : [];

function mergeParsedListing(json, markdown) {
    if (!json) return { ...markdown, homeStatus: null };
    return {
        // A sold / off-market page has no asking price, whatever the markdown shows.
        price: isNotForSale(json.homeStatus) ? null : firstFilled(json.price, markdown.price),
        homeStatus: json.homeStatus || null,
        address: mergeFields(json.address, markdown.address),
        coordinates: json.coordinates || markdown.coordinates || null,
        specs: mergeFields(json.specs, markdown.specs),
        financials: mergeFields(json.financials, markdown.financials),
        details: mergeFields(markdown.details, json.details),
        description: firstFilled(json.description, markdown.description),
        schools: nonEmptyList(markdown.schools, json.schools),
        priceHistory: nonEmptyList(markdown.priceHistory, json.priceHistory),
        taxHistory: nonEmptyList(markdown.taxHistory, json.taxHistory),
        foreclosureHistory: nonEmptyList(markdown.foreclosureHistory, json.foreclosureHistory),
        walkScores: mergeFields(markdown.walkScores, json.walkScores),
        listingAgent: json.listingAgent || markdown.listingAgent
            ? mergeFields(json.listingAgent, markdown.listingAgent)
            : null,
        mlsNumber: firstFilled(json.mlsNumber, markdown.mlsNumber),
        mlsSource: firstFilled(json.mlsSource, markdown.mlsSource),
        marketActivity: mergeFields(json.marketActivity, markdown.marketActivity),
    };
}

// ---------------------------------------------------------------------------
// Zillow parsed data -> productModel sub-documents
// ---------------------------------------------------------------------------
function buildPropertyDetails(z, tweakPercent) {
    const { specs = {}, details = {}, financials = {} } = z;
    const monthlyHoa = tweakAmount(financials.monthlyHoa, tweakPercent);

    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    return {
        interiorDetails: {
            bedroomsBathrooms: compact([
                !isBlank(specs.beds) ? plural(specs.beds, "Bedroom", "Bedrooms") : null,
                !isBlank(specs.baths) ? plural(specs.baths, "Bathroom", "Bathrooms") : null,
            ]),
            masterBathroom: [],
            rooms: [],
            heating: compact([details.heating]),
            cooling: compact([details.cooling]),
            interiorFeatures: compact([
                !isBlank(specs.stories) ? plural(specs.stories, "Story", "Stories") : null,
                !isBlank(details.fireplaceCount) ? plural(details.fireplaceCount, "Fireplace", "Fireplaces") : null,
                details.fireplaceFeatures ? `Fireplace features: ${details.fireplaceFeatures}` : null,
            ]),
        },
        exteriorDetails: {
            parking: compact([
                !isBlank(details.totalParkingSpaces) ? `${details.totalParkingSpaces} Total spaces` : null,
                !isBlank(details.garageSpaces) ? `${details.garageSpaces} Attached garage spaces` : null,
                details.parking,
            ]),
            lotFeatures: compact([
                !isBlank(specs.lotSizeSqft) ? `${Number(specs.lotSizeSqft).toLocaleString()} SqFt Lot` : null,
            ]),
            exteriorFeatures: compact([
                details.sewer ? `Sewer: ${details.sewer}` : null,
                details.water ? `Water: ${details.water}` : null,
            ]),
            constructionFeatures: compact([
                details.foundation ? `Foundation: ${details.foundation}` : null,
                details.roof ? `Roof: ${details.roof}` : null,
                details.zoning ? `Zoning: ${details.zoning}` : null,
            ]),
        },
        community: {
            communityInfo: [],
            hoa: monthlyHoa ? [`$${Number(monthlyHoa).toLocaleString()} monthly HOA fee`] : [],
        },
    };
}

function buildInvestmentData(z, tweakPercent) {
    const { financials = {} } = z;
    const tweak = (v) => tweakAmount(v, tweakPercent);
    const taxHistory = (z.taxHistory || []).map((t) => ({
        year: t.year ?? null,
        propertyTax: tweak(t.propertyTax ?? null),
        taxChange: "",
        taxAssessment: tweak(t.taxAssessment ?? null),
        assessmentChange: "",
    }));
    const latestTax = taxHistory[0] || {};
    // The newest year is often assessed but not billed yet ("--"), so take the
    // tax amount from the newest year that has one.
    const latestPaidTax = taxHistory.find((t) => t.propertyTax != null) || {};
    const rent = tweak(financials.rentZestimate ?? null);

    return {
        valuation: {
            ViharaValue: tweak(financials.zestimate ?? null),
            highRange: null,
            lowRange: null,
            confidenceScore: null,
            evaluatedDate: new Date(),
        },
        rental: {
            estimatedMonthlyRent: rent,
            estimatedAnnualRent: rent != null ? rent * 12 : null,
            rentalValue: rent,
            highRange: null,
            lowRange: null,
            averageRentalTrend: null,
            vacancyRate: null,
        },
        taxData: {
            annualPropertyTax: latestPaidTax.propertyTax ?? null,
            assessedValue: tweak(financials.taxAssessedValue ?? null) ?? latestTax.taxAssessment ?? null,
            assessmentYear: latestTax.year ?? null,
            landValue: null,
            improvementValue: null,
        },
        comparables: [],
        priceHistory: (z.priceHistory || []).map((p) => ({
            year: p.year ?? yearFromDate(p.date),
            event: p.event || "",
            price: tweak(p.price ?? null),
            pricePerSqft: tweak(p.pricePerSqft ?? null),
        })),
        taxHistory,
    };
}

function buildSchools(schools = []) {
    const out = { public: [], private: [] };
    schools.forEach((s) => {
        const entry = {
            name: s.name || null,
            rating: formatSchoolRating(s.rating),
            grades: s.grades || null,
            distance: s.distance || null,
        };
        if (String(s.type || "").toLowerCase() === "private") out.private.push(entry);
        else out.public.push(entry);
    });
    return out;
}

function buildListingAgent(agent) {
    if (!agent || !agent.name) return null;
    return {
        name: agent.name,
        company: agent.company || "",
        phone: agent.phone || "",
        licenseNumber: agent.licenseNumber || "",
    };
}

// ---------------------------------------------------------------------------
// Firecrawl scrape (both requests in parallel)
// ---------------------------------------------------------------------------
async function scrapeListing(zillowUrl, warnings) {
    const [detailsResult, imagesResult] = await Promise.allSettled([
        firecrawlService.scrapePropertyDetails(zillowUrl),
        firecrawlService.scrapePropertyImages(zillowUrl),
    ]);

    // Details are mandatory — without them there is no property.
    if (detailsResult.status === "rejected") throw detailsResult.reason;

    // Images are optional — the admin can still add photos in the draft card.
    let imagesPayload = null;
    if (imagesResult.status === "fulfilled") {
        imagesPayload = imagesResult.value;
    } else {
        warnings.push(`Photos could not be fetched (${imagesResult.reason?.message || "unknown error"}). Add them manually.`);
    }

    return { detailsPayload: detailsResult.value, imagesPayload };
}

// ---------------------------------------------------------------------------
// Cloudinary upload
// ---------------------------------------------------------------------------
async function uploadListingImages(imageUrls, folder, warnings) {
    const imageResults = { requested: imageUrls.length, uploadedCount: 0, failed: [] };
    if (!imageUrls.length) return { image: "", otherImages: [], imageResults };

    if (!cloudinaryService.isConfigured()) {
        warnings.push("Cloudinary env vars are missing — images were skipped.");
        return { image: "", otherImages: [], imageResults };
    }

    const { uploaded, failed } = await cloudinaryService.uploadImagesFromUrls(imageUrls, folder);
    imageResults.uploadedCount = uploaded.length;
    imageResults.failed = failed;

    if (failed.length) warnings.push(`${failed.length} of ${imageUrls.length} images failed to upload to Cloudinary.`);
    if (!uploaded.length) warnings.push("No images uploaded — add photos before publishing.");

    return { image: uploaded[0] || "", otherImages: uploaded.slice(1), imageResults };
}

// ---------------------------------------------------------------------------
// Shared steps (importer + weekly sync)
// ---------------------------------------------------------------------------
/**
 * Scrape + parse one Zillow listing. No uploads, no database.
 *
 * @param {string} zillowUrl  Validated Zillow homedetails URL.
 * @returns {Promise<{ zillow:object, photoUrls:string[], photoSignature:string|null,
 *                     photosFetched:boolean, warnings:string[] }>}
 *          zillow = merged parsed listing (see mergeParsedListing).
 */
async function fetchZillowListing(zillowUrl) {
    const warnings = [];
    const { detailsPayload, imagesPayload } = await scrapeListing(zillowUrl, warnings);

    const zillow = mergeParsedListing(
        parseZillowPropertyJson(imagesPayload),
        processZillowResponse(detailsPayload)
    );
    const { address = {}, specs = {} } = zillow;
    if (!address.street && !specs.beds && !specs.sqft) {
        throw new Errorhandler(
            "Could not read property details from this Zillow page. Check the URL or try again in a minute.",
            422
        );
    }

    const photos = extractZillowImages(imagesPayload);
    const photoUrls = compact([photos.image, ...photos.otherImages]);
    if (imagesPayload && !photoUrls.length) {
        warnings.push("No photos found on the Zillow page — add them manually.");
    }

    return {
        zillow,
        photoUrls,
        photoSignature: photoSignatureFor(photoUrls),
        photosFetched: Boolean(imagesPayload),
        warnings,
    };
}

/**
 * The productModel fields that come purely from Zillow data (money figures
 * already shifted by tweakPercent). The weekly sync refreshes exactly these.
 */
function buildZillowDataFields(zillow, tweakPercent) {
    const coordinates = mapCoordinates(zillow.coordinates);
    const listingAgent = buildListingAgent(zillow.listingAgent);
    const schools = buildSchools(zillow.schools);
    const walkScores = zillow.walkScores || {};

    return {
        propertyDetails: buildPropertyDetails(zillow, tweakPercent),
        investmentData: buildInvestmentData(zillow, tweakPercent),
        marketInsights: {
            medianListPrice: null,
            medianSoldPrice: null,
            daysOnMarket: zillow.marketActivity?.daysOnMarket ?? null,
            salesListPrice: null,
            trends: { listPrice: null, soldPrice: null, daysOnMarket: null, salesRatio: null },
        },
        ...(schools.public.length || schools.private.length ? { schools } : {}),
        ...(Object.values(walkScores).some((v) => v != null) ? { walkScores } : {}),
        ...(coordinates ? { coordinates } : {}),
        ...(listingAgent ? { listingAgent } : {}),
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
/**
 * Build one property draft from a Zillow listing URL.
 *
 * @param {object} input
 * @param {string} input.zillowUrl     Required — validated Zillow homedetails URL.
 * @param {string} [input.folderRoot]  Cloudinary root folder (default vihara/properties).
 * @returns {Promise<{ draft:object, warnings:string[], imageResults:object }>}
 */
async function buildPropertyDraftFromZillow({ zillowUrl, folderRoot = "vihara/properties" }) {
    // 1-2) Scrape + parse ----------------------------------------------------
    const { zillow, photoUrls, photoSignature, warnings } = await fetchZillowListing(zillowUrl);
    const { address = {}, specs = {}, financials = {}, details = {} } = zillow;

    // This property's fixed -2%..+2% — saved on the draft so the weekly sync reuses it.
    const tweakPercent = createTweakPercent();
    const tweak = (v) => tweakAmount(v, tweakPercent);

    // Core facts in productModel field names (also the input for the description).
    const facts = {
        productName: address.street
            ? compact([address.street, address.city, address.state]).join(", ")
            : null,
        street: address.street || null,
        city: address.city || null,
        county: null, // optional — not available on the Zillow listing
        state: address.state || null,
        zipCode: address.zipCode || null,
        beds: specs.beds ?? null,
        baths: specs.baths ?? null,
        squareFootage: specs.sqft ?? null,
        lotSize: specs.lotSizeSqft ?? null,
        yearBuilt: specs.yearBuilt ?? null,
        apn: details.apn || null,
        propertyType: mapPropertyType(details.homeType), // null when Zillow's type has no match — admin fills
        occupancyStatus: null,  // not available on the Zillow listing — admin fills
        assetType: mapAssetType(zillow),
        estimatedValue: tweak(financials.zestimate ?? zillow.price ?? null),
        startBid: startBidFrom(zillow.price, tweakPercent),
    };

    if (facts.startBid == null) {
        warnings.unshift("Zillow shows no list price for this home, so the starting bid is empty. Set it before saving.");
    }

    // 3) Upload images -------------------------------------------------------
    const folder = `${folderRoot}/${folderKeyFor(facts)}`;
    const { image, otherImages, imageResults } = await uploadListingImages(photoUrls, folder, warnings);

    // 4) Assemble the draft --------------------------------------------------
    // Human-readable description via Gemini (falls back to a factual template).
    const propertyDescription = await generatePropertyDescription(facts);

    const draft = {
        // core
        productName: facts.productName,
        ...auctionDefaults(facts),
        propertyDescription,
        propertyType: facts.propertyType,
        occupancyStatus: facts.occupancyStatus,
        street: facts.street,
        city: facts.city,
        county: facts.county,
        state: facts.state,
        zipCode: facts.zipCode,
        beds: facts.beds,
        baths: facts.baths,
        squareFootage: facts.squareFootage,
        lotSize: facts.lotSize,
        yearBuilt: facts.yearBuilt,
        monthlyHOADues: tweak(financials.monthlyHoa ?? 0),
        apn: facts.apn,

        // images (from Cloudinary)
        image,
        otherImages,

        // rich data (money already tweaked)
        ...buildZillowDataFields(zillow, tweakPercent),

        // weekly sync — the admin can pause it in Manage Listings
        zillowSync: {
            url: zillowUrl,
            enabled: true,
            tweakPercent,
            zillowStatus: zillow.homeStatus || null,
            photoSignature,
        },

        // display + status defaults — admin flips these in Manage Listings later
        showOnAuctions: false,
        isLandingPage: false,
        status: "pending",
        availableAreas: ["Exterior", "Kitchen", "Bathroom", "Living Room", "Bedroom"],
    };

    const missing = REQUIRED_CORE_FIELDS.filter((k) => isBlank(draft[k]));
    if (missing.length) {
        warnings.unshift(`Zillow did not provide these required fields: ${missing.join(", ")}. Fill them before saving.`);
    }

    return { draft, warnings, imageResults };
}

module.exports = {
    buildPropertyDraftFromZillow,
    auctionDefaults,
    fetchZillowListing,
    buildZillowDataFields,
    uploadListingImages,
    folderKeyFor,
};
