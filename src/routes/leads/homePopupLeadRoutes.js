// routes/leads/homePopupLeadRoutes.js
const express = require("express");
const router = express.Router();
const { submitHomePopupLead, getAllHomePopupLeads } = require("../../controller/leads/homePopupLeadController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");

// Public — the home page popup form.
router.post("/submit", formRateLimit(), verifyRecaptcha, submitHomePopupLead);

// Admin — paginated home popup leads.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllHomePopupLeads);

module.exports = router;
