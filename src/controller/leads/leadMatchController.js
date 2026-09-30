// controller/leads/leadMatchController.js
//
// Admin "Lead Match" page — which leads fit which properties.
// All scoring lives in services/leadMatch; this file only reads query params.
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const {
  listProperties,
  listLeads,
  matchesForProperty,
  matchesForLead,
  SOURCE_OPTIONS,
} = require("../../services/leadMatch/leadMatchService");

const intParam = (v, def, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || def));

/** GET /api/v1/lead-match/properties?search=&refresh=1 */
exports.getProperties = catchAsyncError(async (req, res) => {
  const data = await listProperties({
    search: String(req.query.search || ""),
    refresh: req.query.refresh === "1",
  });
  res.status(200).json({ success: true, ...data, sources: SOURCE_OPTIONS });
});

/** GET /api/v1/lead-match/leads?search=&source=&page=&limit= */
exports.getLeads = catchAsyncError(async (req, res) => {
  const data = await listLeads({
    search: String(req.query.search || ""),
    source: String(req.query.source || ""),
    page: intParam(req.query.page, 1, 1, 10000),
    limit: intParam(req.query.limit, 50, 1, 100),
    refresh: req.query.refresh === "1",
  });
  res.status(200).json({ success: true, ...data, sources: SOURCE_OPTIONS });
});

/** GET /api/v1/lead-match/property/:id?minScore=&source=&limit= */
exports.getPropertyMatches = catchAsyncError(async (req, res, next) => {
  const data = await matchesForProperty(req.params.id, {
    minScore: intParam(req.query.minScore, 50, 0, 100),
    source: String(req.query.source || ""),
    limit: intParam(req.query.limit, 50, 1, 200),
  });
  if (!data) return next(new Errorhandler("Property not found or no longer open for bidding", 404));
  res.status(200).json({ success: true, ...data });
});

/** GET /api/v1/lead-match/lead/:leadType/:leadId?minScore=&limit= */
exports.getLeadMatches = catchAsyncError(async (req, res, next) => {
  const data = await matchesForLead(req.params.leadType, req.params.leadId, {
    minScore: intParam(req.query.minScore, 50, 0, 100),
    limit: intParam(req.query.limit, 50, 1, 200),
  });
  if (!data) return next(new Errorhandler("Lead not found or has no location/budget to match on", 404));
  res.status(200).json({ success: true, ...data });
});
