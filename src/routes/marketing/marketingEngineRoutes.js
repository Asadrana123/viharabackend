const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const {
  getBuyerTypeSuggestion,
  startRun,
  listRuns,
  getRun,
  editLine,
  approveRun,
  generateCellImages,
} = require("../../controller/marketing/marketingEngineController");

// All routes require authentication + admin role
router.use(isAuthenticated, authorizeRoles("admin"));

// Buyer type suggestion (rules, no AI) — admin confirms before running
router.get("/properties/:propertyId/buyer-type-suggestion", getBuyerTypeSuggestion);

// Runs
router.post("/runs", startRun);
router.get("/runs", listRuns);          // ?propertyId=
router.get("/runs/:runId", getRun);

// Review
router.patch("/runs/:runId/lines/:lineId", editLine);
router.patch("/runs/:runId/approve", approveRun);

// Ad images (one ad set at a time; body { slotIds } regenerates specific images)
router.post("/runs/:runId/cells/:cellKey/images", generateCellImages);

module.exports = router;
