// routes/rensselaerAveLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const {
  registerAndCall,
  getAllRensselaerAveLeads,
} = require("../../controller/leads/rensselaerAveLeadController");

// Public — auction registration from /auction/449-rensselaer-ave
router.post("/register", registerAndCall);

// Admin — Rensselaer Ave Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllRensselaerAveLeads);

module.exports = router;
