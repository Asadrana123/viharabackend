// routes/buyerListLeadRoutes.js
const express = require("express");
const router = express.Router();
const {
  registerBuyerListLead,
  getAllBuyerListLeads,
  exportGoogleOfflineConversions,
} = require("../../controller/leads/buyerListLeadController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

// Public — /buyer-list buy-box sign-up (Mongo + Brevo + Meta CAPI + Slack).
router.post("/register", registerBuyerListLead);

// Admin — weekly Google Ads offline upload (Tier A by gclid), CSV.
router.get("/google-offline", isAuthenticated, authorizeRoles("admin"), exportGoogleOfflineConversions);

// Admin — paginated Buyer List leads (full PII — keep protected).
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllBuyerListLeads);

module.exports = router;
