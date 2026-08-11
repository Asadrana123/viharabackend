// routes/georgiaStLeadRoutes.js
const express = require("express");
const router = express.Router();
const {
  registerAndCall,
  getAllGeorgiaStLeads,
} = require("../controller/georgiaStLeadController");

// Public — auction registration from /auction/449-georgia-st
router.post("/register", registerAndCall);

// Admin — Georgia St Leads tab
// NOTE: if your other admin lead routes wrap their GET with auth middleware
// (isAuthenticatedUser, authorizeRoles("admin")), add the same here.
router.get("/", getAllGeorgiaStLeads);

module.exports = router;
