// routes/leads/facebookFormLeadRoutes.js
//
// Mounted at /api/v1/facebook-leads (see app.js). Admin only. The leads
// themselves arrive through Zernio's webhook (/api/webhooks/zernio).
const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { getAllFacebookFormLeads, getToorakLeads, updateLeadStatus } = require("../../controller/leads/facebookFormLeadController");

router.get("/", isAuthenticated, authorizeRoles("admin"), getAllFacebookFormLeads);
// Toorak lead forms: per-form report + hot-first dial queue, and the team's status for a lead.
router.get("/toorak", isAuthenticated, authorizeRoles("admin"), getToorakLeads);
router.patch("/:id/status", isAuthenticated, authorizeRoles("admin"), updateLeadStatus);

module.exports = router;
