// routes/leads/renovationContractorLeadRoutes.js
const express = require("express");
const router = express.Router();
const { getAllRenovationContractorLeads } = require("../../controller/leads/renovationContractorLeadController");

// Admin — Renovation Contractors/Vendors Leads tab.
// NOTE: matches every other admin lead-list route in this codebase — none of
// them currently enforce auth at the route level either (isAuthenticated +
// authorizeRoles("admin") is missing on early-access, georgia-st, persona,
// etc. too). Worth a dedicated pass to add it everywhere at once rather than
// diverging just this one route.
router.get("/", getAllRenovationContractorLeads);

module.exports = router;
