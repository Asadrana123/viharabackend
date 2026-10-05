const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const router = express.Router();
const {
  registerAndCall,
  getAllEarlyAccessLeads,
} = require("../../controller/leads/earlyAccessLeadController");

// Public — buyer-list submission from /early-access
router.post("/register", registerAndCall);

// Admin — Early Access Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllEarlyAccessLeads);

module.exports = router;
