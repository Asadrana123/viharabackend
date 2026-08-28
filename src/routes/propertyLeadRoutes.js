// routes/propertyLeadRoutes.js
//
// ONE route file for EVERY property auction landing page (/auction/:slug).
// Mounted once at /api/v1/property-lead in app.js — no new mount per property.
const express = require("express");
const router = express.Router();
const {
  registerAndCall,
  getLeadsByProperty,
} = require("../controller/propertyLeadController");

// Public — auction registration from /auction/:slug
router.post("/:slug/register", registerAndCall);

// Admin — Property Leads tab (one property at a time, chosen in the dropdown).
// NOTE: if your other admin lead routes wrap their GET with auth middleware
// (isAuthenticatedUser, authorizeRoles("admin")), add the same here.
router.get("/:slug", getLeadsByProperty);

module.exports = router;
