// routes/landingFormLeadRoutes.js
const express = require("express");
const router = express.Router();
const { submitLandingForm, getLandingFormLeads } = require("../../controller/leads/landingFormLeadController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");

// Public — a form on a landing page made in Admin → Landing Pages
// (Mongo + Slack + email alert + Maya call with consent).
router.post("/:page/submit", formRateLimit(), submitLandingForm);

// Admin — newest landing page form leads (full PII — keep protected).
router.get("/", isAuthenticated, authorizeRoles("admin"), getLandingFormLeads);

module.exports = router;
