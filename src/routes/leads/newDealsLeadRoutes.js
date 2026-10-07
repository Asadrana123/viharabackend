// routes/newDealsLeadRoutes.js
const express = require("express");
const router = express.Router();
const { registerNewDealsLead, getAllNewDealsLeads, getNewDealsSpotlight } = require("../../controller/leads/newDealsLeadController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");

// Public — /new-deals buy-box sign-up (Mongo + Brevo + Meta CAPI + Slack + Maya call).
router.post("/register", formRateLimit(), registerNewDealsLead);

// Public — the spotlight deals' address, photo and specs for the page's cards.
router.get("/deals", getNewDealsSpotlight);

// Admin — paginated New Deals leads (full PII — keep protected).
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllNewDealsLeads);

module.exports = router;
