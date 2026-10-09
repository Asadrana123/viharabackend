// routes/vtext/vtextAdminRoutes.js
//
// Mounted at /api/v1/vtext (see app.js). Admin-only, same pattern as
// outboundRoutes.js. Phase 5 adds the remaining §8.1 read/write surface the
// admin UI needs: conversations, contacts, message retry/cancel/reroute, and
// the stats overview.
const express = require("express");
const router = express.Router();

const { health } = require("../../controller/vtext/vtextAdminController");
const {
  createLine, listLines, getLine, updateLine,
  pauseLine, resumeLine, quarantineLine, reinstateLine, retireLine, toggleDrainMode,
  startWarmup, testSend, getLineUsage, getLineEvents, registerWebhooksForLine,
} = require("../../controller/vtext/vtextLineController");
const { sendMessage, sendBulkMessages, listMessagesByStatus, retryMessage, cancelMessage, rerouteMessage, approveDraft } = require("../../controller/vtext/vtextMessageController");
const { listConversationProperties, listConversations, getConversationMessages, updateConversation } = require("../../controller/vtext/vtextConversationController");
const { getContact, updateContactConsent, markCallBooked } = require("../../controller/vtext/vtextContactController");
const { getStatsOverview } = require("../../controller/vtext/vtextStatsController");
const { getVtextSettings, updateVtextSettings } = require("../../controller/vtext/vtextSettingsController");
const {
  getTemplateVariables, createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate, previewTemplate,
} = require("../../controller/vtext/vtextTemplateController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { requireVtextEnabled } = require("../../middleware/vtextEnabled");

router.use(isAuthenticated, authorizeRoles("admin"));

// /health stays reachable even when disabled — it's the one endpoint whose
// whole job is reporting that state, with more detail than the generic 503
// below. Every other route needs the feature actually on.
router.get("/health", health);
router.use(requireVtextEnabled);

router.get("/stats/overview", getStatsOverview);

router.get("/settings", getVtextSettings);
router.patch("/settings", updateVtextSettings);

router.get("/conversations/properties", listConversationProperties); // before /:id routes
router.get("/conversations", listConversations);
router.get("/conversations/:id/messages", getConversationMessages);
router.patch("/conversations/:id", updateConversation);

router.get("/contacts/:id", getContact);
router.patch("/contacts/:id/consent", updateContactConsent);
router.post("/contacts/:id/call-booked", markCallBooked);

// Literal path before :id, same ordering convention as the rest of this file.
router.get("/templates/variables", getTemplateVariables);
router.post("/templates", createTemplate);
router.get("/templates", listTemplates);
router.get("/templates/:id", getTemplate);
router.patch("/templates/:id", updateTemplate);
router.delete("/templates/:id", deleteTemplate);
router.post("/templates/:id/preview", previewTemplate);

router.post("/messages", sendMessage);
router.post("/messages/bulk", sendBulkMessages);
router.get("/messages", listMessagesByStatus);
router.post("/messages/:id/retry", retryMessage);
router.post("/messages/:id/cancel", cancelMessage);
router.post("/messages/:id/reroute", rerouteMessage);
router.post("/messages/:id/approve-draft", approveDraft);

router.post("/lines", createLine);
router.get("/lines", listLines);
router.get("/lines/:id", getLine);
router.patch("/lines/:id", updateLine);

// Status-transition actions (§7.1/§7.4) and read-only line detail views (§8.1).
router.post("/lines/:id/pause", pauseLine);
router.post("/lines/:id/resume", resumeLine);
router.post("/lines/:id/quarantine", quarantineLine);
router.post("/lines/:id/reinstate", reinstateLine);
router.post("/lines/:id/retire", retireLine);
router.post("/lines/:id/drain", toggleDrainMode);
router.post("/lines/:id/start-warmup", startWarmup);
router.post("/lines/:id/test-send", testSend);
router.get("/lines/:id/usage", getLineUsage);
router.get("/lines/:id/events", getLineEvents);
router.post("/lines/:id/register-webhooks", registerWebhooksForLine);

module.exports = router;
