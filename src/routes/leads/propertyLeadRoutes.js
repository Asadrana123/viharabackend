// routes/propertyLeadRoutes.js
//
// ONE route file for EVERY property auction landing page (/auction/:slug).
// Mounted once at /api/v1/property-lead in app.js — no new mount per property.
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { markQaTestRequest } = require("../../middleware/qaAgentAuth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");
const router = express.Router();
const { sendPhoneCode, verifyPhoneCode, changeEmail } = require("../../controller/leads/dealSheetController");
const {
  registerAndCall,
  registerForDeals,
  getLeadsByProperty,
} = require("../../controller/leads/propertyLeadController");

// Public — the deal finder (/find): one sign-up for several deals. Before
// /:slug/register, which would otherwise take "finder" as a slug.
router.post("/finder/register", formRateLimit({ name: "property-lead" }), verifyRecaptcha, markQaTestRequest, registerForDeals);

// Public — the /deal form's deal sheet: resend / change number, check the code, "Wrong email?". Each needs the
// key the sign-up returned (dealSheetController.js).
router.post("/lead/:id/phone", formRateLimit({ name: "deal-phone", max: 6 }), sendPhoneCode);
router.post("/lead/:id/phone/verify", formRateLimit({ name: "deal-verify", max: 12 }), verifyPhoneCode);
router.post("/lead/:id/email", formRateLimit({ name: "deal-email", max: 4 }), changeEmail);

// Public — auction registration from /auction/:slug. markQaTestRequest flags
// requests from the QA agent so they skip calls/Slack/enrichment/Brevo/texts.
router.post("/:slug/register", formRateLimit({ name: "property-lead" }), verifyRecaptcha, markQaTestRequest, registerAndCall);

// Admin — Property Leads tab (one property at a time).
router.get("/:slug", isAuthenticated, authorizeRoles("admin"), getLeadsByProperty);

module.exports = router;
