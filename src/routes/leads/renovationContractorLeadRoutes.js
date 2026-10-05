// routes/leads/renovationContractorLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const { getAllRenovationContractorLeads } = require("../../controller/leads/renovationContractorLeadController");

// Admin — Renovation Contractors/Vendors Leads tab.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllRenovationContractorLeads);

module.exports = router;
