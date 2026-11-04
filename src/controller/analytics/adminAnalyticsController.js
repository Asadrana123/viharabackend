// controller/analytics/adminAnalyticsController.js
//
// Website analytics for the admin dashboard (Google Analytics 4, read-only).
//   GET /api/v1/admin-analytics/site?range=1d|7d|30d
//   GET /api/v1/admin-analytics/page?range=1d|7d|30d&path=/some/page
//   GET /api/v1/admin-analytics/audience?range=1d|7d|30d
//   GET /api/v1/admin-analytics/marketing?range=1d|7d|30d|90d   (Zernio: paid ads + organic posts)
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const { gaConfigured, fetchGaRangeData, fetchGaPageData, fetchGaAudienceData } = require("../../services/analytics/gaInsightsService");
const { rangeWindows, buildDashboardModel, buildPageModel, buildAudienceModel, RANGES } = require("../../services/analytics/gaDashboardModel");
const cache = require("../../services/analytics/gaDashboardCache").shared;
const { createCache } = require("../../services/analytics/gaDashboardCache");
const { zernioConfigured, fetchMarketingData } = require("../../services/marketing/zernioMarketingService");
const { leadsReceivedBetween } = require("../../services/marketing/marketingLeadsService");
const marketingModel = require("../../services/marketing/marketingDashboardModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");

// Zernio refreshes post numbers about hourly and ad numbers a few times a day; 15 minutes
// keeps the tab quick without showing old numbers for long.
const marketingCache = createCache({ ttlMs: 15 * 60 * 1000 });

const MAX_PATH_CHARS = 500;
const NOT_CONNECTED = "Google Analytics is not connected on this server.";

async function respond(res, next, key, build) {
    try {
        const { value, cached } = await cache.get(key, build);
        res.status(200).json({ success: true, configured: true, ...value, cached, generatedAt: new Date().toISOString() });
    } catch (error) {
        console.error("[admin-analytics] Google Analytics call failed:", error.details || error.message);
        next(new Errorhandler("Could not load numbers from Google Analytics right now. Try again in a minute.", 502));
    }
}

exports.getSiteAnalytics = catchAsyncError(async (req, res, next) => {
    const { range } = req.query;
    if (!RANGES.includes(range)) return next(new Errorhandler("range must be 1d, 7d or 30d", 400));
    if (!gaConfigured()) return res.status(200).json({ success: true, configured: false, range, message: NOT_CONNECTED });

    const windows = rangeWindows(range);
    await respond(res, next, `site:${range}:${windows.current.until}`, async () => ({
        range,
        ...buildDashboardModel(await fetchGaRangeData(windows), windows),
    }));
});

exports.getPageAnalytics = catchAsyncError(async (req, res, next) => {
    const { range, path } = req.query;
    if (!RANGES.includes(range)) return next(new Errorhandler("range must be 1d, 7d or 30d", 400));
    if (typeof path !== "string" || !path.startsWith("/") || path.length > MAX_PATH_CHARS) {
        return next(new Errorhandler(`path must start with "/" and be at most ${MAX_PATH_CHARS} characters`, 400));
    }
    if (!gaConfigured()) return res.status(200).json({ success: true, configured: false, range, message: NOT_CONNECTED });

    const windows = rangeWindows(range);
    await respond(res, next, `page:${range}:${windows.current.until}:${path}`, async () => ({
        range,
        ...buildPageModel(await fetchGaPageData({ ...windows, path }), windows, path),
    }));
});

exports.getAudienceAnalytics = catchAsyncError(async (req, res, next) => {
    const { range } = req.query;
    if (!RANGES.includes(range)) return next(new Errorhandler("range must be 1d, 7d or 30d", 400));
    if (!gaConfigured()) return res.status(200).json({ success: true, configured: false, range, message: NOT_CONNECTED });

    const windows = rangeWindows(range);
    await respond(res, next, `audience:${range}:${windows.current.until}`, async () => ({
        range,
        ...buildAudienceModel(await fetchGaAudienceData(windows), windows),
    }));
});

exports.getMarketingPerformance = catchAsyncError(async (req, res, next) => {
    const { range } = req.query;
    if (!marketingModel.RANGES.includes(range)) return next(new Errorhandler("range must be 1d, 7d, 30d or 90d", 400));
    if (!zernioConfigured()) {
        return res.status(200).json({ success: true, configured: false, range, message: "Zernio is not connected on this server (ZERNIO_API_KEY / ZERNIO_AD_ACCOUNT_ID)." });
    }

    const windows = marketingModel.rangeWindows(range, getAdsLoopConfig().accountTimeZone);
    try {
        const { value, cached } = await marketingCache.get(`marketing:${range}:${windows.current.until}`, async () => {
            const [raw, current, previous] = await Promise.all([
                fetchMarketingData(windows),
                leadsReceivedBetween(windows.current.start, windows.current.end),
                leadsReceivedBetween(windows.previous.start, windows.previous.end),
            ]);
            if (!raw.paid.timeline && !raw.organic.dashboard) {
                throw new Error(raw.paid.error || raw.organic.error || "Zernio returned nothing");
            }
            return { range, ...marketingModel.buildMarketingModel(raw, { current, previous }, windows) };
        });
        res.status(200).json({ success: true, configured: true, ...value, cached, generatedAt: new Date().toISOString() });
    } catch (error) {
        console.error("[admin-analytics] Marketing performance failed:", error.message);
        next(new Errorhandler("Could not load numbers from Zernio right now. Try again in a minute.", 502));
    }
});
