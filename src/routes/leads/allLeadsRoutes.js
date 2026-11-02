// routes/leads/allLeadsRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const { getAllLeads } = require("../../controller/leads/allLeadsController");

// Admin-only: every lead across every funnel.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllLeads);

module.exports = router;
