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
async function buildPropertyDraft({ pdfBuffer, imageUrls = [], folderRoot = "vihara/properties" }) {
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

        // display defaults — admin flips these in Manage Listings later
        showOnAuctions: false,
        isLandingPage: false,
    };

    return { draft, warnings, imageResults };
}

module.exports = { buildPropertyDraft, auctionDefaults };
