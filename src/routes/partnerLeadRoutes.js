// routes/partnerLeadRoutes.js
//
// Mounted at /api/v1/partner (see app.js).
//   POST /register  → public, Partner Program application from /partners
//   GET  /          → admin-only, paginated list for the Partner Leads tab
//
// Guard matches the other admin list endpoints: isAuthenticated + admin role.

const express = require("express");
const router = express.Router();

const { registerAndCall, getAllPartnerLeads } = require("../controller/partnerLeadController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// Public — partner application submit
router.post("/register", registerAndCall);

// Admin — Partner Leads tab
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllPartnerLeads);

module.exports = router;
