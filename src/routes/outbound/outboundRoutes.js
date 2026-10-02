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
  listSendifyTemplatesForOutbound,
  previewEmail,
  sendTestEmail,
  launchEmailCampaign,
  listCampaigns,
  getCampaign,
  getCallPromptVariables,
  getCallPrompt,
  upsertCallPrompt,
  launchCallCampaign,
  getCallCampaign,
  listCallCampaigns,
  getCallTranscript,
} = require("../../controller/outbound/outboundController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

// Literal paths first — /campaigns and /config have no conflicting /:param
// at the root, so nothing here gets shadowed.
router.get("/config", getConfig);
router.post("/contacts/parse", parseContacts);
router.post("/sms/campaigns", launchSmsCampaign);
router.get("/sms/sendify-templates", listSendifyTemplatesForOutbound);
router.post("/email/preview", previewEmail);
router.post("/email/test", sendTestEmail);
router.post("/email/campaigns", launchEmailCampaign);
router.get("/campaigns", listCampaigns);
router.get("/campaigns/:id", getCampaign);

// ── Calls — separate prompt store + call-run collection from the existing
// Calls tab and from Enrichment's call channel. Literal /call/campaigns and
// /call/prompt-variables before /call/prompt/:propertyId and
// /call/campaigns/:id so they're not swallowed as params.
router.get("/call/prompt-variables", getCallPromptVariables);
router
  .route("/call/prompt/:propertyId")
  .get(getCallPrompt)
  .put(upsertCallPrompt);
router.post("/call/campaigns", launchCallCampaign);
router.get("/call/campaigns", listCallCampaigns);
router.get("/call/campaigns/:id", getCallCampaign);
router.get("/call/transcript/:callId", getCallTranscript);

module.exports = router;
