// routes/enrichment/enrichmentRoutes.js
//
// Mounted at /api/v1/enrichment (see app.js). Admin-only, same as Outbound.

const express = require("express");
const router = express.Router();

const {
  getConfig,
  parseList,
  createList,
  listLists,
  getList,
  getRows,
  updateRow,
  deleteList,
  resumeList,
  retryFailedList,
  reEnrichRow,
  dispatchPreview,
  dispatch,
  getCallRun,
} = require("../../controller/enrichment/enrichmentController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/config", getConfig);

// Literal path before /lists/:id so "parse" isn't read as an id.
router.post("/lists/parse", parseList);
router.post("/lists", createList);
router.get("/lists", listLists);
router.get("/lists/:id", getList);
router.delete("/lists/:id", deleteList);
router.get("/lists/:id/rows", getRows);
router.patch("/lists/:id/rows/:rowId", updateRow);
router.post("/lists/:id/resume", resumeList);
router.post("/lists/:id/retry-failed", retryFailedList);
router.post("/lists/:id/rows/:rowId/re-enrich", reEnrichRow);
router.post("/lists/:id/dispatch/preview", dispatchPreview);
router.post("/lists/:id/dispatch", dispatch);
router.get("/call-runs/:id", getCallRun);

module.exports = router;
