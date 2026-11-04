// routes/georgiaStLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");
const router = express.Router();
const {
  registerAndCall,
  getAllGeorgiaStLeads,
} = require("../../controller/leads/georgiaStLeadController");

// Public — auction registration from /auction/449-georgia-st
// Starts a Maya call, so rate limit + captcha. (The live auction pages now
// post to /api/v1/property-lead/:slug/register instead.)
router.post("/register", formRateLimit({ name: "georgia-st" }), verifyRecaptcha, registerAndCall);

// Admin — Georgia St Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllGeorgiaStLeads);

module.exports = router;
