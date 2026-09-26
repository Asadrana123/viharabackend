// controller/enrichment/enrichmentController.js
//
// Thin admin-only handlers for the Enrichment Lists feature. Phase 2 adds
// the actual FullEnrich job: createList now starts it, plus
// resume/retry-failed/re-enrich. The dispatch endpoints (send to
// calling/SMS/email) are still later phases — see enrich.md §9.

const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const enrichmentListService = require("../../services/enrichment/enrichmentListService");
const enrichmentJobService = require("../../services/enrichment/enrichmentJobService");
const { MAX_ROWS_CEILING, EDITABLE_FIELDS } = require("../../services/enrichment/enrichmentContactsService");

/**
 * GET /config
 */
exports.getConfig = catchAsyncError(async (req, res) => {
  return res.json({
    success: true,
    maxRowsCeiling: MAX_ROWS_CEILING,
    fullenrichConfigured: Boolean(process.env.FULLENRICH_API_KEY),
    editableFields: EDITABLE_FIELDS,
  });
});

/**
 * POST /lists/parse
 * Body: { csvData }
 * Parses and checks against the shared enrichment store. Saves nothing,
 * calls FullEnrich for nothing.
 */
exports.parseList = catchAsyncError(async (req, res) => {
  const { csvData } = req.body;
  const result = await enrichmentListService.parseList(csvData);
  return res.json({ success: true, ...result });
});

/**
 * POST /lists
 * Body: { csvData, csvFileName?, name? }
 * Creates the list and its rows, responds, then starts enrichment
 * fire-and-forget (same shape as calling/Outbound campaigns).
 */
exports.createList = catchAsyncError(async (req, res) => {
  const { csvData, csvFileName, name } = req.body;
  const { list, total, noLookupKey, skipped } = await enrichmentListService.createList({
    csvData,
    csvFileName,
    name,
    createdBy: req.user,
  });

  res.status(202).json({ success: true, listId: list._id, total, noLookupKey, skipped });

  enrichmentJobService.startEnrichment(list._id).catch((err) => {
    console.error(`[enrichment] list ${list._id} failed to start:`, err.message);
  });
});

/**
 * GET /lists?page=&limit=
 */
exports.listLists = catchAsyncError(async (req, res) => {
  const { page, limit } = req.query;
  const result = await enrichmentListService.listLists(page, limit);
  return res.json({ success: true, ...result });
});

/**
 * GET /lists/:id
 */
exports.getList = catchAsyncError(async (req, res, next) => {
  const list = await enrichmentListService.getList(req.params.id);
  if (!list) return next(new Errorhandler("List not found", 404));
  return res.json({ success: true, list });
});

/**
 * GET /lists/:id/rows?page=&limit=&status=&search=&excluded=&activeMarket=&channel=
 */
exports.getRows = catchAsyncError(async (req, res) => {
  const { page, limit, status, search, excluded, activeMarket, channel } = req.query;
  const result = await enrichmentListService.getRows(req.params.id, {
    page,
    limit,
    status,
    search,
    excluded,
    activeMarket,
    channel,
  });
  return res.json({ success: true, ...result });
});

/**
 * PATCH /lists/:id/rows/:rowId
 * Body: { overrides?, excluded? }
 */
exports.updateRow = catchAsyncError(async (req, res) => {
  const { overrides, excluded } = req.body;
  const row = await enrichmentListService.updateRow(
    req.params.id,
    req.params.rowId,
    { overrides, excluded },
    req.user
  );
  return res.json({ success: true, row });
});

/**
 * DELETE /lists/:id
 */
exports.deleteList = catchAsyncError(async (req, res) => {
  await enrichmentListService.deleteList(req.params.id);
  return res.json({ success: true });
});

/**
 * POST /lists/:id/resume
 * Restarts an interrupted list's job. 409 if it isn't interrupted.
 */
exports.resumeList = catchAsyncError(async (req, res) => {
  await enrichmentJobService.prepareResume(req.params.id);
  res.status(202).json({ success: true });

  enrichmentJobService.finishPass(req.params.id).catch((err) => {
    console.error(`[enrichment] resume failed for list ${req.params.id}:`, err.message);
  });
});

/**
 * POST /lists/:id/retry-failed
 * Resets this list's failed rows to pending and re-runs. May cost credits
 * for rows that are found this time.
 */
exports.retryFailedList = catchAsyncError(async (req, res) => {
  const result = await enrichmentJobService.prepareRetryFailed(req.params.id);
  res.status(202).json({ success: true, ...result });

  if (result.started) {
    enrichmentJobService.finishPass(req.params.id).catch((err) => {
      console.error(`[enrichment] retry-failed failed for list ${req.params.id}:`, err.message);
    });
  }
});

/**
 * POST /lists/:id/rows/:rowId/re-enrich
 * Forces a fresh lookup for one row, even if a stored result already
 * exists. The precondition checks and claim (prepareReEnrich) are awaited
 * first, so a bad request gets an immediate, correct error; the actual
 * FullEnrich submit+poll (runReEnrich) is fire-and-forget like createList —
 * a single round trip took 60-100s in Phase 0 testing, too slow to hold the
 * request open for. The row shows "pending" until the poll picks up the
 * result.
 */
exports.reEnrichRow = catchAsyncError(async (req, res) => {
  const { row, person } = await enrichmentJobService.prepareReEnrich(req.params.id, req.params.rowId);

  res.status(202).json({ success: true });

  enrichmentJobService.runReEnrich(req.params.id, row, person).catch((err) => {
    console.error(`[enrichment] re-enrich failed for row ${req.params.rowId}:`, err.message);
  });
});
