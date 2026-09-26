// controller/enrichment/enrichmentController.js
//
// Thin admin-only handlers for the Enrichment Lists feature (Phase 1 scope:
// no FullEnrich calls, no sends — see enrich.md §9). Later phases add
// resume/retry-failed/re-enrich and the dispatch endpoints here.

const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const enrichmentListService = require("../../services/enrichment/enrichmentListService");
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
 * Creates the list and its rows. Enrichment itself starts in Phase 2.
 */
exports.createList = catchAsyncError(async (req, res) => {
  const { csvData, csvFileName, name } = req.body;
  const { list, total, noLookupKey, skipped } = await enrichmentListService.createList({
    csvData,
    csvFileName,
    name,
    createdBy: req.user,
  });

  return res.status(202).json({ success: true, listId: list._id, total, noLookupKey, skipped });
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
