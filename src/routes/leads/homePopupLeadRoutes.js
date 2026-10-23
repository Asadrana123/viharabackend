// routes/leads/homePopupLeadRoutes.js
const express = require("express");
const router = express.Router();
const { submitHomePopupLead, getAllHomePopupLeads } = require("../../controller/leads/homePopupLeadController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");

// Public — the home page popup form.
router.post("/submit", formRateLimit(), submitHomePopupLead);

// Admin — paginated home popup leads.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllHomePopupLeads);

module.exports = router;
