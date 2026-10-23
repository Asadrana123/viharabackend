// routes/leads/facebookFormLeadRoutes.js
//
// Mounted at /api/v1/facebook-leads (see app.js). Admin only. The leads
// themselves arrive through Zernio's webhook (/api/webhooks/zernio).
const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { getAllFacebookFormLeads } = require("../../controller/leads/facebookFormLeadController");

router.get("/", isAuthenticated, authorizeRoles("admin"), getAllFacebookFormLeads);

module.exports = router;
