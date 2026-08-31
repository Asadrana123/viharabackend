// routes/norCalLeadRoutes.js
const express = require("express");
const router = express.Router();
const {
  registerNorCalLead,
  getAllNorCalLeads,
} = require("../controller/norCalLeadController");

// NOTE: confirm these two names match your middleware/auth.js exports. Every
// other admin lead route uses the same guard — if yours differ (e.g. `protect`,
// `isAdmin`), swap this one line. Do NOT leave the GET below unprotected: it
// returns full lead PII.
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// Public — Northern California early-access lead capture
// (register + Maya call + Brevo sync + FullEnrich enrichment).
router.post("/register", registerNorCalLead);

// Admin — paginated NorCal leads for the admin panel tab.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllNorCalLeads);

module.exports = router;
