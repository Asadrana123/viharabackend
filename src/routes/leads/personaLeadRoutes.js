const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const { getAllPersonaLeads } = require("../../controller/leads/personaLeadController");

// Admin — Persona Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllPersonaLeads);

module.exports = router;