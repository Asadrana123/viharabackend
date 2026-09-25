// routes/outbound/outboundRoutes.js
//
// Mounted at /api/v1/outbound (see app.js). Every route here is admin-only —
// this whole feature is an internal admin tool, there's no public endpoint.

const express = require("express");
const router = express.Router();

const {
  getConfig,
  parseContacts,
  launchSmsCampaign,
  previewEmail,
  sendTestEmail,
  launchEmailCampaign,
  listCampaigns,
  getCampaign,
} = require("../../controller/outbound/outboundController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

// Literal paths first — /campaigns and /config have no conflicting /:param
// at the root, so nothing here gets shadowed.
router.get("/config", getConfig);
router.post("/contacts/parse", parseContacts);
router.post("/sms/campaigns", launchSmsCampaign);
router.post("/email/preview", previewEmail);
router.post("/email/test", sendTestEmail);
router.post("/email/campaigns", launchEmailCampaign);
router.get("/campaigns", listCampaigns);
router.get("/campaigns/:id", getCampaign);

module.exports = router;
