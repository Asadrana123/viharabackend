// controller/propertyImportController.js
//
// Admin-only endpoints powering the Property Importer tab. These build a draft;
// they never persist. The admin reviews/edits the returned draft in the UI and
// submits it to the existing POST /api/v1/product/bulk to actually create.

const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const { buildPropertyDraft } = require("../services/propertyImportService");
const cloudinaryService = require("../services/cloudinaryService");

/**
 * POST /api/v1/property-import/parse
 * multipart/form-data:
 *   - pdf        : the PropStream CMA PDF (required, field name "pdf")
 *   - imageUrls  : JSON string array of Zillow photo URLs (optional)
 *   - folderRoot : optional Cloudinary root folder override
 *
 * Returns: { success, draft, warnings, imageResults }
 */
exports.parseFromPropStream = catchAsyncError(async (req, res, next) => {
    if (!req.file || !req.file.buffer) {
        return next(new Errorhandler("A PropStream PDF file is required (field name 'pdf')", 400));
    }

    // imageUrls arrives as a JSON string in multipart form data.
    let imageUrls = [];
    if (req.body.imageUrls) {
        try {
            const parsed = typeof req.body.imageUrls === "string"
                ? JSON.parse(req.body.imageUrls)
                : req.body.imageUrls;
            if (Array.isArray(parsed)) imageUrls = parsed;
        } catch {
            return next(new Errorhandler("imageUrls must be a JSON array of URLs", 400));
        }
    }

    const folderRoot = typeof req.body.folderRoot === "string" && req.body.folderRoot.trim()
        ? req.body.folderRoot.trim()
        : undefined;

    // Optional Zillow structured data (schools, priceHistory, resoFacts) from
    // the browser extractor — arrives as a JSON string in the multipart form.
    let zillowData = null;
    if (req.body.zillowData) {
        try {
            zillowData = typeof req.body.zillowData === "string"
                ? JSON.parse(req.body.zillowData)
                : req.body.zillowData;
        } catch {
            return next(new Errorhandler("zillowData must be valid JSON", 400));
        }
    }

    const { draft, warnings, imageResults } = await buildPropertyDraft({
        pdfBuffer: req.file.buffer,
        imageUrls,
        zillowData,
        folderRoot,
    });

    return res.status(200).json({ success: true, draft, warnings, imageResults });
});

/**
 * POST /api/v1/property-import/upload-images
 * body: { imageUrls: string[], folder?: string }
 *
 * Uploads image URLs to Cloudinary and returns their secure_urls. Useful for
 * re-running just the image step after adding/removing photos in the tab.
 *
 * Returns: { success, image, otherImages, uploadedCount, failed }
 */
exports.uploadImages = catchAsyncError(async (req, res, next) => {
    const { imageUrls, folder } = req.body || {};
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return next(new Errorhandler("imageUrls must be a non-empty array", 400));
    }
    if (!cloudinaryService.isConfigured()) {
        return next(new Errorhandler("Cloudinary is not configured on the server", 500));
    }

    const targetFolder = typeof folder === "string" && folder.trim()
        ? folder.trim()
        : "vihara/properties/uploads";

    const { uploaded, failed } = await cloudinaryService.uploadImagesFromUrls(imageUrls, targetFolder);

    return res.status(200).json({
        success: true,
        image: uploaded[0] || "",
        otherImages: uploaded.slice(1),
        uploadedCount: uploaded.length,
        failed,
    });
});
