// routes/social/zernioWebhookRoutes.js
//
// Mounted at /api/webhooks/zernio (see app.js). Zernio calls it for the events
// its webhook subscription lists; today only `comment.received`, which drives
// the AI auto-reply on Instagram comments (services/social/commentReplyService.js).
//
// Every delivery must carry a valid X-Zernio-Signature (HMAC of the raw body
// with ZERNIO_WEBHOOK_SECRET). Zernio gets its 200 at once; the reply work runs
// after, so a slow AI call never makes Zernio retry.
const express = require("express");
const router = express.Router();
const { processZernioWebhook, verifyZernioSignature } = require("../../services/social/commentReplyService");

router.post("/", (req, res) => {
    const signature = req.get("X-Zernio-Signature") || req.get("X-Late-Signature");
    if (!verifyZernioSignature(req.rawBody, signature)) {
        return res.status(401).json({ success: false, message: "Invalid signature" });
    }
    res.status(200).json({ received: true });
    setImmediate(() => processZernioWebhook(req.body));
});

module.exports = router;
