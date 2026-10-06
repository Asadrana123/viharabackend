// routes/propertyLeadRoutes.js
//
// ONE route file for EVERY property auction landing page (/auction/:slug).
// Mounted once at /api/v1/property-lead in app.js — no new mount per property.
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { markQaTestRequest } = require("../../middleware/qaAgentAuth");
const router = express.Router();
const {
  registerAndCall,
  getLeadsByProperty,
} = require("../../controller/leads/propertyLeadController");

// Public — auction registration from /auction/:slug. markQaTestRequest flags
// requests from the QA agent so they skip calls/Slack/enrichment/Brevo/texts.
router.post("/:slug/register", markQaTestRequest, registerAndCall);

// Admin — Property Leads tab (one property at a time).
router.get("/:slug", isAuthenticated, authorizeRoles("admin"), getLeadsByProperty);

module.exports = router;
