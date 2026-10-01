// controller/leads/buyerMatchController.js
//
// Admin "Buyer Match" page — which buyers (leads) fit which properties.
// All scoring lives in services/buyerMatch; this file reads query params and
// starts / stops the twice-daily Buyer Match calls (services/buyerMatch/matchCallService).
const multer = require("multer");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const {
  listProperties,
  listLeads,
  listSellers,
  matchesForProperty,
  matchesForLead,
  matchesForSeller,
  matchesForSheet,
  leadActivity,
  SOURCE_OPTIONS,
} = require("../../services/buyerMatch/buyerMatchService");
const { getCallingStatus, startCampaign, stopCampaign } = require("../../services/buyerMatch/matchCallService");
const { parsePropertySheet } = require("../../services/buyerMatch/sheet");

const SHEET_MAX_BYTES = 10 * 1024 * 1024;
const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SHEET_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Upload an .xlsx or .csv file"), ok);
  },
});

const intParam = (v, def, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || def));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateParam = (v) => (DATE_RE.test(String(v || "")) ? String(v) : undefined);

// Shared query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&source=&search=
const common = (q) => ({
  search: String(q.search || ""),
  source: String(q.source || ""),
  from: dateParam(q.from),
  to: dateParam(q.to),
});

/** GET /api/v1/buyer-match/properties?search=&from=&to=&refresh=1 */
exports.getProperties = catchAsyncError(async (req, res) => {
  const data = await listProperties({ ...common(req.query), refresh: req.query.refresh === "1" });
  res.status(200).json({ success: true, ...data, sources: SOURCE_OPTIONS });
});

/** GET /api/v1/buyer-match/leads?search=&source=&from=&to=&page=&limit= */
exports.getLeads = catchAsyncError(async (req, res) => {
  const data = await listLeads({
    ...common(req.query),
    page: intParam(req.query.page, 1, 1, 10000),
    limit: intParam(req.query.limit, 50, 1, 100),
  });
  res.status(200).json({ success: true, ...data, sources: SOURCE_OPTIONS });
});

/** GET /api/v1/buyer-match/sellers?search=&from=&to= */
exports.getSellers = catchAsyncError(async (req, res) => {
  const data = await listSellers(common(req.query));
  res.status(200).json({ success: true, ...data });
});

/** GET /api/v1/buyer-match/property/:id?minScore=&source=&from=&to=&limit= */
exports.getPropertyMatches = catchAsyncError(async (req, res, next) => {
  const data = await matchesForProperty(req.params.id, {
    ...common(req.query),
    minScore: intParam(req.query.minScore, 50, 0, 100),
    limit: intParam(req.query.limit, 50, 1, 200),
  });
  if (!data) return next(new Errorhandler("Property not found or no longer open for bidding", 404));
  res.status(200).json({ success: true, ...data });
});

/** GET /api/v1/buyer-match/seller/:id?minScore=&source=&from=&to=&perProperty= */
exports.getSellerMatches = catchAsyncError(async (req, res, next) => {
  const data = await matchesForSeller(req.params.id, {
    ...common(req.query),
    minScore: intParam(req.query.minScore, 60, 0, 100),
    perProperty: intParam(req.query.perProperty, 5, 1, 50),
  });
  if (!data) return next(new Errorhandler("Seller not found or has no open properties", 404));
  res.status(200).json({ success: true, ...data });
});

/** GET /api/v1/buyer-match/lead/:leadType/:leadId?minScore=&limit= */
exports.getLeadMatches = catchAsyncError(async (req, res, next) => {
  const data = await matchesForLead(req.params.leadType, req.params.leadId, {
    minScore: intParam(req.query.minScore, 50, 0, 100),
    limit: intParam(req.query.limit, 50, 1, 200),
  });
  if (!data) return next(new Errorhandler("Buyer not found or has no location/budget to match on", 404));
  res.status(200).json({ success: true, ...data });
});

/** GET /api/v1/buyer-match/lead/:leadType/:leadId/activity */
exports.getLeadActivity = catchAsyncError(async (req, res, next) => {
  const data = await leadActivity(req.params.leadType, req.params.leadId);
  if (!data) return next(new Errorhandler("Buyer not found", 404));
  res.status(200).json({ success: true, ...data });
});

// ─── Buyer Match calling (twice-daily calls about one property) ────────────

const adminOf = (req) => ({ id: req.user?._id, name: req.user?.name || req.user?.email || "Admin" });

/** GET /api/v1/buyer-match/calling/:leadType/:leadId?propertyId= — what's running + history */
exports.getCalling = catchAsyncError(async (req, res, next) => {
  try {
    const data = await getCallingStatus({
      leadType: req.params.leadType,
      leadId: req.params.leadId,
      propertyId: req.query.propertyId || null,
    });
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    if (err.statusCode) return next(new Errorhandler(err.message, err.statusCode));
    throw err;
  }
});

/**
 * POST /api/v1/buyer-match/calling/start   { leadType, leadId, propertyId, takeover }
 * 409 + needsTakeover when calls are already going to this person and the
 * admin hasn't confirmed taking over.
 */
exports.startCalling = catchAsyncError(async (req, res, next) => {
  const { leadType, leadId, propertyId, takeover } = req.body || {};
  if (!leadType || !leadId || !propertyId) {
    return next(new Errorhandler("leadType, leadId and propertyId are required", 400));
  }
  try {
    const campaign = await startCampaign({ leadType, leadId, propertyId, takeover: takeover === true, admin: adminOf(req) });
    res.status(201).json({ success: true, campaign });
  } catch (err) {
    if (err.needsTakeover) return res.status(409).json({ success: false, needsTakeover: true, message: err.message });
    if (err.statusCode) return next(new Errorhandler(err.message, err.statusCode));
    throw err;
  }
});

/** POST /api/v1/buyer-match/calling/:campaignId/stop */
exports.stopCalling = catchAsyncError(async (req, res, next) => {
  try {
    const campaign = await stopCampaign(req.params.campaignId, adminOf(req));
    res.status(200).json({ success: true, campaign });
  } catch (err) {
    if (err.statusCode) return next(new Errorhandler(err.message, err.statusCode));
    throw err;
  }
});

/** Multer wrapper — one sheet in the "file" field; size/type errors → clean 400. */
exports.uploadSheetFile = (req, res, next) => {
  sheetUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? `Sheets must be ${SHEET_MAX_BYTES / (1024 * 1024)} MB or smaller`
        : error.message || "Upload failed";
    next(new Errorhandler(message, 400));
  });
};

/**
 * POST /api/v1/buyer-match/sheet   multipart: file (+ sheet, minScore, source, from, to)
 *
 * Match buyers against the properties in an uploaded sheet. Nothing is saved —
 * the file is read in memory and scored against the current buyer snapshot.
 */
exports.matchSheet = catchAsyncError(async (req, res, next) => {
  if (!req.file) return next(new Errorhandler("Choose a sheet to upload", 400));

  let parsed;
  try {
    parsed = await parsePropertySheet(req.file.buffer, req.file.originalname, String(req.body.sheet || ""));
  } catch (err) {
    return next(new Errorhandler(err.message, err.statusCode || 400));
  }
  if (!parsed.properties.length) return next(new Errorhandler("No property rows found in this sheet", 400));

  const result = await matchesForSheet(parsed.properties, {
    ...common(req.body),
    minScore: intParam(req.body.minScore, 60, 0, 100),
  });

  res.status(200).json({
    success: true,
    fileName: req.file.originalname,
    sheets: parsed.sheets,
    sheet: parsed.sheet,
    columns: parsed.columns,
    skipped: parsed.skipped,
    truncated: parsed.truncated,
    ...result,
  });
});
