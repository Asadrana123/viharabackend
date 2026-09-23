// services/property/propertyImportService.js
//
// Orchestrates the property importer end to end:
//   1. Scrape the Zillow listing through Firecrawl (markdown + raw HTML, in parallel).
//   2. Parse the markdown into property facts and the raw HTML into photo URLs.
//   3. Upload the photos to Cloudinary.
//   4. Assemble a complete productModel-shaped DRAFT — with the auction business
//      fields defaulted / left blank for the admin to fill.
//
// This never writes to the database. It returns a draft object that the admin
// edits in the importer tab and then submits to the existing
// POST /api/v1/product/bulk endpoint.

const Errorhandler = require("../../utils/errorhandler");
const firecrawlService = require("../integrations/firecrawlService");
const cloudinaryService = require("../shared/cloudinaryService");
const { processZillowResponse } = require("./parsers/zillowDetailsParser");
const { extractZillowImages } = require("./parsers/zillowImageParser");
const { generatePropertyDescription } = require("./propertyDescriptionService");

// productModel fields that are required but Zillow may not provide.
const REQUIRED_CORE_FIELDS = [
    "street", "city", "county", "state", "zipCode", "beds", "baths",
    "squareFootage", "lotSize", "yearBuilt", "apn", "propertyType",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const isBlank = (v) => v === null || v === undefined || v === "";
const compact = (arr) => arr.filter((v) => !isBlank(v));

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
    if (/real estate owned|bank owned|\breo\b/.test(conditions)) return "Reo Bank Owned";
    if (/short sale/.test(conditions)) return "Short Sale";
    if (/foreclos|trustee/.test(conditions) || zillow.foreclosureHistory?.length) return "Foreclosure Homes";
    return "";
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

// Auction business terms. Only the two DATES are left for the admin to fill;
// everything else is seeded or defaulted so /bulk never rejects.
//   - reservePrice / startBid : seeded from the Zestimate (or list price) — editable
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
        startBid: estVal ?? 0,
        eventID: "TBD",
        trusteeSaleNumber: "TBD",
        onlineOrInPerson: "Online",
        assetType: parsed?.assetType || "",
    };
}

// ---------------------------------------------------------------------------
// Zillow parsed data -> productModel sub-documents
// ---------------------------------------------------------------------------
function buildPropertyDetails(z) {
    const { specs = {}, details = {}, financials = {} } = z;

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
            hoa: financials.monthlyHoa ? [`$${Number(financials.monthlyHoa).toLocaleString()} monthly HOA fee`] : [],
        },
    };
}

function buildInvestmentData(z) {
    const { financials = {} } = z;
    const taxHistory = (z.taxHistory || []).map((t) => ({
        year: t.year ?? null,
        propertyTax: t.propertyTax ?? null,
        taxChange: "",
        taxAssessment: t.taxAssessment ?? null,
        assessmentChange: "",
    }));
    const latestTax = taxHistory[0] || {};
    const rent = financials.rentZestimate ?? null;

    return {
        valuation: {
            ViharaValue: financials.zestimate ?? null,
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
            annualPropertyTax: latestTax.propertyTax ?? null,
            assessedValue: financials.taxAssessedValue ?? latestTax.taxAssessment ?? null,
            assessmentYear: latestTax.year ?? null,
            landValue: null,
            improvementValue: null,
        },
        comparables: [],
        priceHistory: (z.priceHistory || []).map((p) => ({
            year: p.year ?? yearFromDate(p.date),
            event: p.event || "",
            price: p.price ?? null,
            pricePerSqft: p.pricePerSqft ?? null,
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
    const warnings = [];

    // 1) Scrape --------------------------------------------------------------
    const { detailsPayload, imagesPayload } = await scrapeListing(zillowUrl, warnings);

    // 2) Parse ---------------------------------------------------------------
    const zillow = processZillowResponse(detailsPayload);
    const { address = {}, specs = {}, financials = {}, details = {} } = zillow;

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

    // Core facts in productModel field names (also the input for the description).
    const facts = {
        productName: address.street
            ? compact([address.street, address.city, address.state]).join(", ")
            : null,
        street: address.street || null,
        city: address.city || null,
        county: null, // not available on the Zillow listing — admin fills
        state: address.state || null,
        zipCode: address.zipCode || null,
        beds: specs.beds ?? null,
        baths: specs.baths ?? null,
        squareFootage: specs.sqft ?? null,
        lotSize: specs.lotSizeSqft ?? null,
        yearBuilt: specs.yearBuilt ?? null,
        apn: details.apn || null,
        propertyType: null,     // not available on the Zillow listing — admin fills
        occupancyStatus: null,  // not available on the Zillow listing — admin fills
        assetType: mapAssetType(zillow),
        estimatedValue: financials.zestimate ?? zillow.price ?? null,
    };

    // 3) Upload images -------------------------------------------------------
    const folder = `${folderRoot}/${folderKeyFor(facts)}`;
    const { image, otherImages, imageResults } = await uploadListingImages(photoUrls, folder, warnings);

    // 4) Assemble the draft --------------------------------------------------
    // Human-readable description via Gemini (falls back to a factual template).
    const propertyDescription = await generatePropertyDescription(facts);

    const coordinates = mapCoordinates(zillow.coordinates);
    const listingAgent = buildListingAgent(zillow.listingAgent);
    const schools = buildSchools(zillow.schools);
    const walkScores = zillow.walkScores || {};

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
        monthlyHOADues: financials.monthlyHoa ?? 0,
        apn: facts.apn,

        // images (from Cloudinary)
        image,
        otherImages,

        // rich data
        propertyDetails: buildPropertyDetails(zillow),
        investmentData: buildInvestmentData(zillow),
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

module.exports = { buildPropertyDraftFromZillow, auctionDefaults };
