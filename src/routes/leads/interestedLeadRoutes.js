// routes/interestedLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const { getInterestedLeads } = require("../../controller/leads/interestedLeadController");

// Admin-only: warm leads across every funnel.
router.get("/", isAuthenticated, authorizeRoles("admin"), getInterestedLeads);

module.exports = router;
