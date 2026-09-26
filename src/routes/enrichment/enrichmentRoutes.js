// routes/enrichment/enrichmentRoutes.js
//
// Mounted at /api/v1/enrichment (see app.js). Admin-only, same as Outbound.
// Phase 1 routes only — resume/retry-failed/re-enrich/dispatch are added in
// later phases (see enrich.md §6, §9).

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

module.exports = router;
