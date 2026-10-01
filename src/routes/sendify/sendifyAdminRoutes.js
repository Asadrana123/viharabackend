// routes/sendify/sendifyAdminRoutes.js
//
// Mounted at /api/v1/sendify (see app.js). Admin-only, same pattern as
// outboundRoutes.js. Phase 5 adds the remaining §8.1 read/write surface the
// admin UI needs: conversations, contacts, message retry/cancel/reroute, and
// the stats overview.
const express = require("express");
const router = express.Router();

const { health } = require("../../controller/sendify/sendifyAdminController");
const {
  createLine, listLines, getLine, updateLine,
  pauseLine, resumeLine, quarantineLine, reinstateLine, retireLine, toggleDrainMode,
  startWarmup, testSend, getLineUsage, getLineEvents,
} = require("../../controller/sendify/sendifyLineController");
const { sendMessage, sendBulkMessages, listMessagesByStatus, retryMessage, cancelMessage, rerouteMessage } = require("../../controller/sendify/sendifyMessageController");
const { listConversations, getConversationMessages, updateConversation } = require("../../controller/sendify/sendifyConversationController");
const { getContact, updateContactConsent } = require("../../controller/sendify/sendifyContactController");
const { getStatsOverview } = require("../../controller/sendify/sendifyStatsController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { requireSendifyEnabled } = require("../../middleware/sendifyEnabled");

router.use(isAuthenticated, authorizeRoles("admin"));

// /health stays reachable even when disabled — it's the one endpoint whose
// whole job is reporting that state, with more detail than the generic 503
// below. Every other route needs the feature actually on.
router.get("/health", health);
router.use(requireSendifyEnabled);

router.get("/stats/overview", getStatsOverview);

router.get("/conversations", listConversations);
router.get("/conversations/:id/messages", getConversationMessages);
router.patch("/conversations/:id", updateConversation);

router.get("/contacts/:id", getContact);
router.patch("/contacts/:id/consent", updateContactConsent);

router.post("/messages", sendMessage);
router.post("/messages/bulk", sendBulkMessages);
router.get("/messages", listMessagesByStatus);
router.post("/messages/:id/retry", retryMessage);
router.post("/messages/:id/cancel", cancelMessage);
router.post("/messages/:id/reroute", rerouteMessage);

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

module.exports = router;
