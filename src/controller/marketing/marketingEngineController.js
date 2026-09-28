const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const marketingEngineService = require("../../services/marketing/marketingEngineService");
const creativeImageService = require("../../services/marketing/creativeImageService");

// All business logic lives in services/marketing/marketingEngineService.js.
// These handlers only read the request and shape the response.

// ─── BUYER TYPE SUGGESTION ──────────────────────────────────────────────────
exports.getBuyerTypeSuggestion = catchAsyncError(async (req, res) => {
  const suggestion = await marketingEngineService.getBuyerTypeSuggestion(req.params.propertyId);
  res.status(200).json({ success: true, suggestion });
});

// ─── START A RUN ─────────────────────────────────────────────────────────────
// Returns 202 right away; the run keeps processing in the background and the
// admin tab polls GET /runs/:runId for progress.
exports.startRun = catchAsyncError(async (req, res, next) => {
  const { propertyId, buyerType } = req.body;

  if (!propertyId || !buyerType) {
    return next(new Errorhandler("propertyId and buyerType are required", 400));
  }

  const run = await marketingEngineService.startRun({
    propertyId,
    buyerType,
    userId: req.user._id,
  });

  res.status(202).json({ success: true, message: "Marketing run started", run });
});

// ─── LIST RUNS FOR A PROPERTY ──────────────────────────────────────────────
exports.listRuns = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.query;
  if (!propertyId) return next(new Errorhandler("propertyId is required", 400));

  const runs = await marketingEngineService.listRuns(propertyId);
  res.status(200).json({ success: true, runs });
});

// ─── GET SINGLE RUN ─────────────────────────────────────────────────────────
exports.getRun = catchAsyncError(async (req, res) => {
  const run = await marketingEngineService.getRun(req.params.runId);
  res.status(200).json({ success: true, run });
});

// ─── EDIT A LINE ────────────────────────────────────────────────────────────
// Always saves; any compliance problems come back as warnings on line.flags.
exports.editLine = catchAsyncError(async (req, res) => {
  const line = await marketingEngineService.editLine({
    runId: req.params.runId,
    lineId: req.params.lineId,
    text: req.body.text,
    userId: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: line.flags.length ? "Line saved with compliance warnings" : "Line saved",
    line,
  });
});

// ─── GENERATE AD IMAGES FOR ONE AD SET ─────────────────────────────────────
// Body (optional): { slotIds: ["staticA|1:1"] } regenerates only those images.
// Returns 202 right away; images are made in the background and the admin tab
// polls GET /runs/:runId for progress.
exports.generateCellImages = catchAsyncError(async (req, res) => {
  const job = await creativeImageService.startCellImages({
    runId: req.params.runId,
    cellKey: req.params.cellKey,
    slotIds: req.body?.slotIds,
    userId: req.user._id,
  });

  res.status(202).json({ success: true, message: "Image generation started", job });
});

// ─── APPROVE A RUN ──────────────────────────────────────────────────────────
exports.approveRun = catchAsyncError(async (req, res) => {
  const run = await marketingEngineService.approveRun({
    runId: req.params.runId,
    userId: req.user._id,
  });

  res.status(200).json({ success: true, message: "Marketing run approved", run });
});
