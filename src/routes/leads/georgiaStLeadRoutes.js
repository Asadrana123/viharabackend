// routes/georgiaStLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const {
  registerAndCall,
  getAllGeorgiaStLeads,
} = require("../../controller/leads/georgiaStLeadController");

// Public — auction registration from /auction/449-georgia-st
router.post("/register", registerAndCall);

// Admin — Georgia St Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllGeorgiaStLeads);

module.exports = router;
