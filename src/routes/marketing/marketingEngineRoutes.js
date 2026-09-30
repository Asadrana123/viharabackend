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
  previewCellImage,
} = require("../../controller/marketing/marketingEngineController");
const {
  uploadAssetFile,
  listTemplates,
  getTemplate,
  listTemplateVersions,
  createTemplate,
  updateTemplate,
  previewTemplate,
  setTemplateDefaults,
  archiveTemplate,
  restoreTemplate,
  uploadTemplateAsset,
} = require("../../controller/marketing/marketingTemplateController");

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
router.post("/runs/:runId/cells/:cellKey/preview", previewCellImage);   // no AI, nothing saved

// Ad template library (upload once, use for any property)
router.get("/templates", listTemplates);                         // ?includeArchived=true
router.post("/templates", createTemplate);
router.post("/templates/preview", previewTemplate);
router.post("/templates/assets", uploadAssetFile, uploadTemplateAsset);
router.get("/templates/:templateId", getTemplate);
router.get("/templates/:templateId/versions", listTemplateVersions);
router.put("/templates/:templateId", updateTemplate);           // saves a new version
router.patch("/templates/:templateId/defaults", setTemplateDefaults);
router.patch("/templates/:templateId/archive", archiveTemplate);
router.patch("/templates/:templateId/restore", restoreTemplate);

module.exports = router;
