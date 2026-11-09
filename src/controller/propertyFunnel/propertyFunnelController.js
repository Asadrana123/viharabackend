// controller/propertyFunnel/propertyFunnelController.js
//
// Property Funnel admin tab (Prajwal's package, vihara-next components/admin/PropertyFunnel).
//   GET /api/v1/admin-analytics/property-funnel   admin only (routes/analytics/adminAnalyticsRoutes.js)
//
// PROPERTY_FUNNEL_SOURCE=db sends the real Dataset (lib/property-funnel/contract.ts in vihara-next).
// Anything else (the default) answers { source: "sample" } and the tab shows its built-in sample data,
// so the tab works before the real data is switched on.
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");

exports.getPropertyFunnel = catchAsyncError(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (process.env.PROPERTY_FUNNEL_SOURCE !== "db") {
    return res.status(200).json({ success: true, source: "sample" });
  }
  // Step 3 of the plan builds the Dataset from our collections here.
  return next(new Errorhandler("The Property Funnel's real data isn't built yet. Unset PROPERTY_FUNNEL_SOURCE to see the sample.", 501));
});
