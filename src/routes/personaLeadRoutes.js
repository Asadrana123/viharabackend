const express = require("express");
const router = express.Router();
const { getAllPersonaLeads } = require("../controller/personaLeadController");

// NOTE: add your admin auth middleware here to match other admin routes,
// e.g. router.get("/", isAuthenticatedAdmin, getAllPersonaLeads);
router.get("/", getAllPersonaLeads);

module.exports = router;