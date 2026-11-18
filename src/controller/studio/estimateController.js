// controller/studio/estimateController.js
//
// The Studio's Estimate page (vihara.ai/studio/estimate): how a new video, static or carousel may
// do on Meta before it goes live. Numbers from our past ads, an AI check of the creative, and
// guess vs real once linked to the live ad. See services/marketing/creativeEstimateService.js.

const fs = require("fs");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const EditorProfile = require("../../model/studio/editorProfileModel");
const StudioVideo = require("../../model/studio/studioVideoModel");
const StudioRun = require("../../model/studio/studioRunModel");
const { zernioConfigured } = require("../../services/marketing/zernioMarketingService");
const { BUYER_TYPES } = require("../../services/studio/runService");
const svc = require("../../services/marketing/creativeEstimateService");

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const NOT_CONNECTED = "The Meta ads data (Zernio) is not connected on this server.";
const ZERNIO_DOWN = "Could not load our past ads from Zernio right now. Try again in a minute.";

async function nameOf(user) {
    const profile = await EditorProfile.findOne({ user: user._id }).select("name").lean();
    return profile?.name || user.name || user.email;
}

const removeUploads = (files) => {
    for (const f of files || []) fs.promises.unlink(f.path).catch(() => {});
};

const isId = (v) => /^[a-f0-9]{24}$/.test(String(v));

/** GET /api/v1/studio/estimates - this person's estimates (all, for an admin) and how good the tool has been. */
const listEstimates = catchAsyncError(async (req, res, next) => {
    if (!zernioConfigured()) return next(new ErrorHandler(NOT_CONNECTED, 503));
    let accuracy = null;
    try {
        accuracy = await svc.accuracy();
    } catch (e) {
        console.error(`[creative-estimate] accuracy: ${e.message}`);
    }
    const estimates = await svc.listEstimates(req.user);
    res.status(200).json({
        success: true,
        isAdmin: req.user.role === "admin",
        estimates,
        accuracy,
        buyerTypes: BUYER_TYPES.map(({ id, label }) => ({ id, label })),
    });
});

/** GET /api/v1/studio/estimates/:id - one estimate, for waiting on the AI check. */
const getEstimate = catchAsyncError(async (req, res, next) => {
    if (!isId(req.params.id)) return next(new ErrorHandler("No such estimate.", 404));
    const estimate = await svc.getEstimate(req.user, req.params.id);
    if (!estimate) return next(new ErrorHandler("No such estimate.", 404));
    res.status(200).json({ success: true, estimate });
});

async function create(req, res, next, files, studioVideo = null) {
    if (!zernioConfigured()) {
        removeUploads(files);
        return next(new ErrorHandler(NOT_CONNECTED, 503));
    }
    try {
        const estimate = await svc.createEstimate({ user: req.user, byName: await nameOf(req.user), body: req.body, files, studioVideo });
        res.status(201).json({ success: true, estimate: await svc.getEstimate(req.user, estimate._id) });
    } catch (e) {
        removeUploads(files);
        if (e instanceof svc.InputError) return next(new ErrorHandler(e.message, 400));
        console.error(`[creative-estimate] create failed: ${e.message}`);
        return next(new ErrorHandler(ZERNIO_DOWN, 502));
    }
}

/** POST /api/v1/studio/estimates (multipart: files[], leadPlace, buyerType, dailyBudget, days, adText, title) - a new estimate for uploaded files. */
const createFromUpload = catchAsyncError(async (req, res, next) => {
    const files = (req.files || []).map((f) => ({ path: f.path, name: f.originalname || "file", mimeType: f.mimetype, bytes: f.size }));
    const tooBig = files.find((f) => svc.IMAGE_TYPES[f.mimeType] && f.bytes > MAX_IMAGE_BYTES);
    if (tooBig) {
        removeUploads(files);
        return next(new ErrorHandler(`Images are at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB each.`, 400));
    }
    return create(req, res, next, files);
});

/** POST /api/v1/studio/estimates/video/:coreId  { leadPlace, buyerType, dailyBudget, days, adText } - a new estimate for a Studio video's latest cut. */
const createFromStudioVideo = catchAsyncError(async (req, res, next) => {
    const coreId = String(req.params.coreId);
    const filter = { coreId };
    if (req.user.role !== "admin") {
        const own = await StudioRun.exists({ requestedBy: req.user._id, coreId });
        if (!own) return next(new ErrorHandler("No such video.", 404));
    }
    const video = await StudioVideo.findOne(filter).lean();
    if (!video) return next(new ErrorHandler("No such video.", 404));
    // The video's buyer (D-057) when the page did not send one.
    if (!req.body?.buyerType) {
        const run = await StudioRun.findOne({ coreId }).select("buyer").lean();
        if (run?.buyer?.icpId) req.body = { ...req.body, buyerType: run.buyer.icpId };
    }
    let file;
    try {
        file = await svc.studioVideoFile(video);
    } catch (e) {
        if (e instanceof svc.InputError) return next(new ErrorHandler(e.message, 400));
        console.error(`[creative-estimate] could not fetch cut of ${coreId}: ${e.message}`);
        return next(new ErrorHandler("Could not open that video's cut right now. Try again in a minute.", 502));
    }
    return create(req, res, next, [file], video);
});

/** GET /api/v1/studio/estimates/ads - recent Meta ads an estimate can be linked to. */
const listLinkableAds = catchAsyncError(async (req, res, next) => {
    if (!zernioConfigured()) return next(new ErrorHandler(NOT_CONNECTED, 503));
    try {
        res.status(200).json({ success: true, ads: await svc.linkableAds() });
    } catch (e) {
        console.error(`[creative-estimate] linkable ads: ${e.message}`);
        next(new ErrorHandler(ZERNIO_DOWN, 502));
    }
});

/** POST /api/v1/studio/estimates/:id/link  { adId | null } - the live Meta ad this became (null unlinks). */
const linkEstimate = catchAsyncError(async (req, res, next) => {
    if (!isId(req.params.id)) return next(new ErrorHandler("No such estimate.", 404));
    try {
        const estimate = await svc.linkEstimate(req.user, await nameOf(req.user), req.params.id, req.body?.adId ?? null);
        if (!estimate) return next(new ErrorHandler("No such estimate.", 404));
        res.status(200).json({ success: true, estimate });
    } catch (e) {
        if (e instanceof svc.InputError) return next(new ErrorHandler(e.message, 400));
        console.error(`[creative-estimate] link: ${e.message}`);
        next(new ErrorHandler(ZERNIO_DOWN, 502));
    }
});

module.exports = { listEstimates, getEstimate, createFromUpload, createFromStudioVideo, listLinkableAds, linkEstimate };
