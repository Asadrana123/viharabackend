// controller/property/propertyImportController.js
//
// Admin-only endpoints powering the Property Importer tab. These build a draft;
// they never persist. The admin reviews/edits the returned draft in the UI and
// submits it to the existing POST /api/v1/product/bulk to actually create.

const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const { buildPropertyDraftFromZillow } = require("../../services/property/propertyImportService");
const firecrawlService = require("../../services/integrations/firecrawlService");
const cloudinaryService = require("../../services/shared/cloudinaryService");

/**
 * Validate a Zillow listing URL and strip query/hash so Firecrawl always gets
 * the canonical page. Returns the clean URL, or null when invalid.
 */
function normalizeZillowUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
        const url = new URL(raw.trim());
        const isZillowHost = url.hostname === "zillow.com" || url.hostname.endsWith(".zillow.com");
        if (url.protocol !== "https:" || !isZillowHost) return null;
        if (!url.pathname.includes("/homedetails/")) return null;
        return `${url.origin}${url.pathname}`;
    } catch {
        return null;
    }
}

/**
 * POST /api/v1/property-import/zillow
 * body: { url: string, folderRoot?: string }
 *   - url        : Zillow listing URL (https://www.zillow.com/homedetails/...)
 *   - folderRoot : optional Cloudinary root folder override
 *
 * Returns: { success, draft, warnings, imageResults }
 */
exports.importFromZillow = catchAsyncError(async (req, res, next) => {
    const { url, folderRoot } = req.body || {};

    const zillowUrl = normalizeZillowUrl(url);
    if (!zillowUrl) {
        return next(new Errorhandler(
            "A valid Zillow listing URL is required (https://www.zillow.com/homedetails/...)",
            400
        ));
    }
    if (!firecrawlService.isConfigured()) {
        return next(new Errorhandler("Firecrawl is not configured on the server", 500));
    }

    const { draft, warnings, imageResults } = await buildPropertyDraftFromZillow({
        zillowUrl,
        folderRoot: typeof folderRoot === "string" && folderRoot.trim() ? folderRoot.trim() : undefined,
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
