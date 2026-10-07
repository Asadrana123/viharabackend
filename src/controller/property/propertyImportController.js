// controller/property/propertyImportController.js
//
// Admin-only endpoints powering the Property Importer tab. These build a draft;
// they never persist. The admin reviews/edits the returned draft in the UI and
// submits it to the existing POST /api/v1/product/bulk to actually create.

const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const { buildPropertyDraftFromMarketData } = require("../../services/property/propertyImportService");
const firecrawlService = require("../../services/integrations/firecrawlService");
const cloudinaryService = require("../../services/shared/cloudinaryService");
const { normalizeMarketDataUrl } = require("../../utils/marketDataUrl");
const PropertyImportJob = require("../../model/property/propertyImportJobModel");
const importQueue = require("../../services/property/propertyImportQueueService");
const mongoose = require("mongoose");

/**
 * POST /api/v1/property-import/market-data
 * body: { url: string, folderRoot?: string }
 *   - url        : market data listing URL (https://.../homedetails/...)
 *   - folderRoot : optional Cloudinary root folder override
 *
 * Returns: { success, draft, warnings, imageResults }
 */
exports.importFromMarketData = catchAsyncError(async (req, res, next) => {
    const { url, folderRoot } = req.body || {};

    const marketDataUrl = normalizeMarketDataUrl(url);
    if (!marketDataUrl) {
        return next(new Errorhandler(
            "A valid market data listing URL is required (https://.../homedetails/...)",
            400
        ));
    }
    if (!firecrawlService.isConfigured()) {
        return next(new Errorhandler("Firecrawl is not configured on the server", 500));
    }

    const { draft, warnings, imageResults } = await buildPropertyDraftFromMarketData({
        marketDataUrl,
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

// ---------------------------------------------------------------------------
// Import queue — many market data links at once, scraped slowly in the background
// (services/property/propertyImportQueueService).
// ---------------------------------------------------------------------------

/** Job fields for the queue list — the draft itself is fetched per job. */
const JOB_SUMMARY_FIELDS = "url status error warnings attempts queuedAt startedAt finishedAt createdAt draft.productName";

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * POST /api/v1/property-import/market-data/queue
 * body: { urls: string[] | string, folderRoot?: string }
 *   - urls: market data links — an array, or one string with links separated by
 *           new lines / spaces / commas.
 *
 * Returns: { success, queuedCount, queued, invalid, skipped }
 */
exports.queueMarketDataImports = catchAsyncError(async (req, res, next) => {
    const { urls, folderRoot } = req.body || {};
    const list = Array.isArray(urls)
        ? urls
        : typeof urls === "string" ? urls.split(/[\s,]+/) : [];
    const cleaned = list.map((u) => String(u || "").trim()).filter(Boolean);

    if (!cleaned.length) {
        return next(new Errorhandler("Add at least one market data listing URL", 400));
    }
    if (cleaned.length > importQueue.MAX_URLS_PER_BATCH) {
        return next(new Errorhandler(`Add at most ${importQueue.MAX_URLS_PER_BATCH} links at a time`, 400));
    }
    if (!firecrawlService.isConfigured()) {
        return next(new Errorhandler("Firecrawl is not configured on the server", 500));
    }

    const { queued, invalid, skipped } = await importQueue.enqueueImports({
        urls: cleaned,
        folderRoot: typeof folderRoot === "string" && folderRoot.trim() ? folderRoot.trim() : null,
        userId: req.user?._id || null,
    });

    return res.status(queued.length ? 201 : 200).json({
        success: true,
        queuedCount: queued.length,
        queued: queued.map((j) => ({ _id: j._id, url: j.url, status: j.status })),
        invalid,
        skipped,
    });
});

/**
 * GET /api/v1/property-import/jobs
 * Every job still in the importer, in queue order (drafts not included).
 *
 * Returns: { success, jobs, worker: { busy, nextScrapeInMs } }
 */
exports.listImportJobs = catchAsyncError(async (req, res) => {
    const jobs = await PropertyImportJob.find({})
        .select(JOB_SUMMARY_FIELDS)
        .sort({ queuedAt: 1 })
        .limit(500)
        .lean();

    return res.status(200).json({
        success: true,
        jobs: jobs.map(({ draft, ...j }) => ({ ...j, productName: draft?.productName || null })),
        worker: { busy: importQueue.isBusy(), nextScrapeInMs: importQueue.nextScrapeInMs() },
    });
});

/**
 * GET /api/v1/property-import/jobs/:id
 * One job with its full draft.
 */
exports.getImportJob = catchAsyncError(async (req, res, next) => {
    if (!isObjectId(req.params.id)) return next(new Errorhandler("Import job not found", 404));
    const job = await PropertyImportJob.findById(req.params.id).lean();
    if (!job) return next(new Errorhandler("Import job not found", 404));
    return res.status(200).json({ success: true, job });
});

/**
 * POST /api/v1/property-import/jobs/:id/retry
 * Put a failed job back at the end of the queue.
 */
exports.retryImportJob = catchAsyncError(async (req, res, next) => {
    if (!isObjectId(req.params.id)) return next(new Errorhandler("Import job not found", 404));
    const job = await importQueue.retryJob(req.params.id);
    if (!job) return next(new Errorhandler("Only a failed import can be retried", 400));
    return res.status(200).json({ success: true, job: { _id: job._id, url: job.url, status: job.status } });
});

/**
 * DELETE /api/v1/property-import/jobs
 * body: { ids: string[] }
 * Remove jobs from the importer — cancels queued ones, dismisses finished ones
 * (e.g. after their drafts were created). A job being scraped right now can't
 * be removed until it finishes.
 */
exports.removeImportJobs = catchAsyncError(async (req, res, next) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isObjectId) : [];
    if (!ids.length) return next(new Errorhandler("ids must be a non-empty array", 400));

    const { deletedCount } = await PropertyImportJob.deleteMany({
        _id: { $in: ids },
        status: { $ne: "processing" },
    });
    return res.status(200).json({ success: true, removedCount: deletedCount });
});
