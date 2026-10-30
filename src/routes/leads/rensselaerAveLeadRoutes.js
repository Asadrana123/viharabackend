// routes/rensselaerAveLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");
const router = express.Router();
const {
  registerAndCall,
  getAllRensselaerAveLeads,
} = require("../../controller/leads/rensselaerAveLeadController");

// Public — auction registration from /auction/449-rensselaer-ave
// Starts a Maya call, so rate limit + captcha. (The live auction pages now
// post to /api/v1/property-lead/:slug/register instead.)
router.post("/register", formRateLimit({ name: "rensselaer-ave" }), verifyRecaptcha, registerAndCall);

// Admin — Rensselaer Ave Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllRensselaerAveLeads);

module.exports = router;
