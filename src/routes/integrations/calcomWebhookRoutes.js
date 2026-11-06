// routes/integrations/calcomWebhookRoutes.js
//
// Mounted at /api/webhooks/calcom (see app.js). Cal.com calls it for the
// booking events its webhook subscription lists (BOOKING_CREATED,
// BOOKING_RESCHEDULED, BOOKING_CANCELLED). Every delivery must carry a valid
// X-Cal-Signature-256 (hex HMAC-SHA256 of the raw body with
// CALCOM_WEBHOOK_SECRET); without the secret set, everything is refused.
// Cal.com gets its 200 at once; the work runs after.
const express = require("express");
const router = express.Router();
const { verifyCalSignature } = require("../../services/calcom/calcomPayload");
const { handleCalWebhook } = require("../../services/calcom/calcomBookingService");

router.post("/", (req, res) => {
  if (!verifyCalSignature(req.rawBody, req.get("X-Cal-Signature-256"))) {
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }
  res.status(200).json({ received: true });
  setImmediate(() => handleCalWebhook(req.body));
});

module.exports = router;
