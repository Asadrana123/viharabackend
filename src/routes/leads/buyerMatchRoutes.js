// routes/buyerMatchRoutes.js
const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const {
  getProperties,
  getLeads,
  getSellers,
  getPropertyMatches,
  getSellerMatches,
  getLeadMatches,
  getLeadActivity,
  getCalling,
  startCalling,
  stopCalling,
  uploadSheetFile,
  matchSheet,
} = require("../../controller/leads/buyerMatchController");

// Admin only — every response carries buyer PII, and /calling places real calls.
router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/properties", getProperties);
router.get("/leads", getLeads);
router.get("/sellers", getSellers);
router.get("/property/:id", getPropertyMatches);
router.get("/seller/:id", getSellerMatches);
router.get("/lead/:leadType/:leadId", getLeadMatches);
router.get("/lead/:leadType/:leadId/activity", getLeadActivity);
router.get("/calling/:leadType/:leadId", getCalling);
router.post("/calling/start", startCalling);
router.post("/calling/:campaignId/stop", stopCalling);
router.post("/sheet", uploadSheetFile, matchSheet);

module.exports = router;
