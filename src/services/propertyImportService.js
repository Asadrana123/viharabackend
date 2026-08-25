// services/propertyImportService.js
//
// Orchestrates the property importer end to end:
//   1. Parse a PropStream CMA PDF into productModel-shaped data.
//   2. Upload the supplied Zillow photo URLs to Cloudinary.
//   3. Assemble a complete productModel-shaped DRAFT — with the auction business
//      fields left blank for the admin to fill.
//
// This never writes to the database. It returns a draft object that the admin
// edits in the importer tab and then submits to the existing
// POST /api/v1/product/bulk endpoint.

const { parsePropStreamPdf } = require("./propStreamParserService");
const cloudinaryService = require("./cloudinaryService");
const { generatePropertyDescription } = require("./propertyDescriptionService");
const { mapZillowData } = require("./zillowMapper");

// Auction business terms. Only the two DATES are left for the admin to fill;
// everything else is seeded from the PDF or defaulted so /bulk never rejects.
//   - reservePrice / startBid : seeded from PropStream Estimated Value (editable)
//   - minIncrement            : 1000 default
//   - emd                     : 0 default
//   - commission              : 0 default
//   - eventID / trusteeSale   : 'TBD' (not reliably in the PDF)
//   - onlineOrInPerson        : 'Online' default
//   - assetType               : 'Foreclosure Homes' when the PDF is distressed
//   - start/end TIME          : hidden defaults (schema requires the strings;
//                               the UI drops the time inputs — dates decide it)
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

/** Turn a parsed street/city into a stable Cloudinary folder key. */
function folderKeyFor(parsed) {
    const base = `${parsed.street || "property"} ${parsed.city || ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || "property";
}

/**
 * Build one property draft.
 *
 * @param {object}   input
 * @param {Buffer}   input.pdfBuffer      Required — the PropStream CMA PDF.
 * @param {string[]} [input.imageUrls]    Optional — Zillow photo URLs.
 * @param {string}   [input.folderRoot]   Cloudinary root folder (default vihara/properties).
 * @returns {Promise<{ draft:object, warnings:string[], imageResults:object }>}
 */
async function buildPropertyDraft({ pdfBuffer, imageUrls = [], zillowData = null, folderRoot = "vihara/properties" }) {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
        throw new Error("A PropStream PDF file is required");
    }

    const warnings = [];

    // 1) Parse the PDF ------------------------------------------------------
    const { parsed, missing } = await parsePropStreamPdf(pdfBuffer);
    if (missing.length) {
        warnings.push(
            `PDF did not contain these required fields: ${missing.join(", ")}. Fill them before saving.`
        );
    }

    // 2) Upload images ------------------------------------------------------
    let image = "";
    let otherImages = [];
    const cleanUrls = Array.isArray(imageUrls)
        ? imageUrls.filter((u) => typeof u === "string" && u.trim())
        : [];

    let imageResults = { requested: cleanUrls.length, uploadedCount: 0, failed: [] };

    if (cleanUrls.length) {
        if (!cloudinaryService.isConfigured()) {
            warnings.push("Cloudinary env vars are missing — images were skipped.");
        } else {
            const folder = `${folderRoot}/${folderKeyFor(parsed)}`;
            const { uploaded, failed } = await cloudinaryService.uploadImagesFromUrls(cleanUrls, folder);
            if (uploaded.length) {
                image = uploaded[0];
                otherImages = uploaded.slice(1);
            }
            imageResults = { requested: cleanUrls.length, uploadedCount: uploaded.length, failed };
            if (failed.length) {
                warnings.push(`${failed.length} of ${cleanUrls.length} images failed to upload to Cloudinary.`);
            }
            if (!uploaded.length) {
                warnings.push("No images uploaded — add photos before publishing.");
            }
        }
    } else {
        warnings.push("No image URLs supplied — run the Zillow bookmarklet and include photos before publishing.");
    }

    // 3) Assemble the draft -------------------------------------------------
    // Parsed PropStream data + Cloudinary images + blank auction fields.
    // Field order mirrors productModel for easy scanning.
    // Human-readable description via Gemini (falls back to a factual template).
    const propertyDescription = await generatePropertyDescription(parsed);

    const draft = {
        // core (from PDF)
        productName: parsed.productName,
        ...auctionDefaults(parsed),
        propertyDescription,
        propertyType: parsed.propertyType,
        occupancyStatus: parsed.occupancyStatus,
        street: parsed.street,
        city: parsed.city,
        county: parsed.county,
        state: parsed.state,
        zipCode: parsed.zipCode,
        beds: parsed.beds,
        baths: parsed.baths,
        squareFootage: parsed.squareFootage,
        lotSize: parsed.lotSize,
        yearBuilt: parsed.yearBuilt,
        monthlyHOADues: parsed.monthlyHOADues,
        apn: parsed.apn,

        // images (from Cloudinary)
        image,
        otherImages,

        // rich data (from PDF)
        propertyDetails: parsed.propertyDetails,
        investmentData: parsed.investmentData,
        marketInsights: parsed.marketInsights,

        // display + status defaults — admin flips these in Manage Listings later
        showOnAuctions: false,
        isLandingPage: false,
        status: "pending",
        availableAreas: ["Exterior", "Kitchen", "Bathroom", "Living Room", "Bedroom"],
    };

    // 4) Merge Zillow data (schools, priceHistory, richer details) -----------
    // Zillow only FILLS GAPS — it never overwrites data the PDF already provided.
    if (zillowData) {
        try {
            const z = mapZillowData(zillowData);

            // schools — PDF never has these
            if (z.schools && (z.schools.public.length || z.schools.private.length)) {
                draft.schools = z.schools;
            }

            // priceHistory — only if the PDF had none
            if (z.priceHistory.length && draft.investmentData.priceHistory.length === 0) {
                draft.investmentData.priceHistory = z.priceHistory;
            }

            // taxHistory — Zillow's is usually multi-year; prefer it when richer
            if (z.taxHistory.length > draft.investmentData.taxHistory.length) {
                draft.investmentData.taxHistory = z.taxHistory;
            }

            // propertyDetails — fill only the arrays the PDF left empty
            if (z.propertyDetails) {
                const d = draft.propertyDetails;
                const zi = z.propertyDetails.interior;
                const ze = z.propertyDetails.exterior;
                const fill = (target, key, src) => {
                    if ((!target[key] || target[key].length === 0) && src && src.length) target[key] = src;
                };
                fill(d.interiorDetails, "heating", zi.heating);
                fill(d.interiorDetails, "cooling", zi.cooling);
                fill(d.interiorDetails, "rooms", zi.rooms);
                fill(d.interiorDetails, "interiorFeatures", zi.interiorFeatures);
                fill(d.exteriorDetails, "parking", ze.parking);
                fill(d.exteriorDetails, "lotFeatures", ze.lotFeatures);
                fill(d.exteriorDetails, "exteriorFeatures", ze.exteriorFeatures);
                fill(d.exteriorDetails, "constructionFeatures", ze.constructionFeatures);
            }

            // valuation range — PDF has no range, so Zillow's fills the gap
            if (z.valuationRange) {
                const val = draft.investmentData.valuation;
                if (val.highRange == null) val.highRange = z.valuationRange.high;
                if (val.lowRange == null) val.lowRange = z.valuationRange.low;
            }

            // rental — PDF rent wins; Zillow's rent Zestimate only fills a blank
            if (z.rentZestimate != null) {
                const r = draft.investmentData.rental;
                if (r.estimatedMonthlyRent == null) {
                    r.estimatedMonthlyRent = z.rentZestimate;
                    r.estimatedAnnualRent = z.rentZestimate * 12;
                    r.rentalValue = z.rentZestimate;
                }
            }

            // walk/bike/transit scores — PDF never has these
            if (z.walkScores && (!draft.walkScores || Object.keys(draft.walkScores).length === 0)) {
                draft.walkScores = z.walkScores;
            }

            // assetType — Zillow "RealEstateOwned" only fills a blank; a value the
            // PDF/parser already set (e.g. Foreclosure Homes) is kept (PDF wins).
            if (z.assetType && (!draft.assetType || draft.assetType === "")) {
                draft.assetType = z.assetType;
            }

            const added = [];
            if (draft.schools?.public?.length || draft.schools?.private?.length) added.push("schools");
            if (draft.investmentData.priceHistory.length) added.push("price history");
            if (draft.walkScores) added.push("walk scores");
            if (draft.investmentData.valuation.highRange != null) added.push("value range");
            if (added.length) warnings.push(`Zillow enrichment added: ${added.join(", ")}.`);
        } catch (err) {
            warnings.push(`Zillow data could not be merged (${err.message}). PDF data is unaffected.`);
        }
    }

    return { draft, warnings, imageResults };
}

module.exports = { buildPropertyDraft, auctionDefaults };
