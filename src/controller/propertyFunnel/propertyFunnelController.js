// controller/propertyFunnel/propertyFunnelController.js
//
// Property Funnel admin tab (Prajwal's package, vihara-next components/admin/PropertyFunnel).
//   GET /api/v1/admin-analytics/property-funnel?days=N   admin only (routes/analytics/adminAnalyticsRoutes.js)
//   days: 14 to 400, default 60
//
// PROPERTY_FUNNEL_SOURCE=db sends the real Dataset (lib/property-funnel/contract.ts in vihara-next).
// Anything else (the default) answers { source: "sample" } and the tab shows its built-in sample data,
// so the tab works before the real data is switched on.
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const { getPropertyFunnelDataset } = require("../../services/propertyFunnel/propertyFunnelService");

exports.getPropertyFunnel = catchAsyncError(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (process.env.PROPERTY_FUNNEL_SOURCE !== "db") {
    return res.status(200).json({ success: true, source: "sample" });
  }
  try {
    const dataset = await getPropertyFunnelDataset({ days: req.query.days });
    return res.status(200).json({ success: true, source: "db", dataset });
  } catch (error) {
    console.error("[property-funnel] build failed:", error);
    return next(new Errorhandler("Could not build the Property Funnel data right now. Try again in a minute.", 500));
  }
});

// ---------------------------------------------------------------- step 6: ad links and Cold / Warm / Hot
//   GET /api/v1/admin-analytics/property-funnel/ad-links?days=30|60|90
//   PUT /api/v1/admin-analytics/property-funnel/ad-links/:adId          { propertyIds: ["<slug>", ...] }
//   PUT /api/v1/admin-analytics/property-funnel/ad-sets/:adSetId/stage  { awareness: "Cold" | "Warm" | "Hot" | null }
const adLinks = require("../../services/propertyFunnel/adLinksService");

const adminName = (req) => [req.user && req.user.name, req.user && req.user.last_name].filter(Boolean).join(" ") || null;
const LINK_DAYS = [30, 60, 90];

async function answer(res, next, work) {
  try {
    return res.status(200).json({ success: true, ...(await work()) });
  } catch (error) {
    if (error instanceof adLinks.InputError) return next(new Errorhandler(error.message, 400));
    console.error("[property-funnel] ad links:", error);
    return next(new Errorhandler("Could not save that right now. Try again in a minute.", 500));
  }
}

exports.getFunnelAdLinks = catchAsyncError(async (req, res, next) => {
  const days = LINK_DAYS.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  return answer(res, next, () => adLinks.getAdLinks({ days }));
});

exports.setFunnelAdLinks = catchAsyncError(async (req, res, next) =>
  answer(res, next, async () => ({ links: await adLinks.setAdLinks(req.params.adId, req.body && req.body.propertyIds, adminName(req)) })));

exports.setFunnelAdSetStage = catchAsyncError(async (req, res, next) =>
  answer(res, next, () => adLinks.setAdSetStage(req.params.adSetId, req.body ? req.body.awareness : undefined, adminName(req))));
