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
