// routes/interestedLeadRoutes.js
const express = require("express");
const router = express.Router();
const { getInterestedLeads } = require("../controller/interestedLeadController");

// IMPORTANT: apply the SAME auth middleware your other admin lead routes use
// (e.g. whatever georgiaStLeadRoutes.js / partnerLeadRoutes.js apply) — this is
// an admin-only view. For example, if you use shared helpers:
//
//   const { isAuthenticatedUser, authorizeRoles } = require("../middleware/auth");
//   router.get("/", isAuthenticatedUser, authorizeRoles("admin"), getInterestedLeads);
//
// Left unguarded below only so it mirrors the existing lead-route shape — wire
// in your middleware to match the other lead tabs before shipping.
router.get("/", getInterestedLeads);

module.exports = router;
