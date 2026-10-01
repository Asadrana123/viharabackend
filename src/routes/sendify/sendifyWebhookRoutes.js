// routes/sendify/sendifyWebhookRoutes.js
//
// Mounted at /api/webhooks/sendify (see app.js), mirroring
// /api/webhooks/brevo. Public — no cookie auth, the per-line webhookKey in
// the path is the security boundary (sendify-infra.md §6.1).
const express = require("express");
const router = express.Router();

const { receive, ping } = require("../../controller/sendify/sendifyWebhookController");
const { requireSendifyEnabled } = require("../../middleware/sendifyEnabled");

router.use(requireSendifyEnabled);

router.post("/:channelType/:lineKey", receive);
router.get("/:channelType/:lineKey", ping);

module.exports = router;
