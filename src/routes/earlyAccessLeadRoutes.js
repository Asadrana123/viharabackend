const express = require("express");
const router = express.Router();
const {
  registerAndCall,
  getAllEarlyAccessLeads,
} = require("../controller/earlyAccessLeadController");

// Public — buyer-list submission from /early-access
router.post("/register", registerAndCall);

// Admin — Early Access Leads tab
// NOTE: if your personaLeadRoutes wraps its GET with auth middleware
// (e.g. isAuthenticatedUser, authorizeRoles("admin")), add the same here.
router.get("/", getAllEarlyAccessLeads);

module.exports = router;
