// controller/brevoWebhookController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const { ingestBrevoEvents } = require("../services/emailEventsService");

// Brevo does NOT sign its webhooks, so the endpoint URL is the security boundary.
// We add a shared-secret check: the token must arrive either as ?token=... or an
// `x-webhook-token` header and match BREVO_WEBHOOK_SECRET. If the env var is
// unset, the check is skipped (with a warning) so the endpoint still works before
// you've configured the secret — same graceful-degrade pattern as brevoService.
const WEBHOOK_SECRET = process.env.BREVO_WEBHOOK_SECRET || "";

const isAuthorized = (req) => {
  if (!WEBHOOK_SECRET) {
    console.warn("⚠️  BREVO_WEBHOOK_SECRET unset — email webhook is unauthenticated.");
    return true;
  }
  const token = req.query.token || req.get("x-webhook-token") || "";
  return token === WEBHOOK_SECRET;
};

/**
 * POST /api/webhooks/brevo/email   (public — Brevo pushes here)
 *
 * Saves each delivered/opened/clicked/... event Brevo sends. Always answers 200
 * on a well-formed request so Brevo doesn't retry; a real DB error throws out of
 * ingestBrevoEvents → catchAsyncError → 500, which is exactly when we WANT Brevo
 * to retry the delivery.
 */
const handleEmailWebhook = catchAsyncError(async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const result = await ingestBrevoEvents(req.body);
  return res.status(200).json({ success: true, ...result });
});

/**
 * GET /api/webhooks/brevo/email
 * Health check so you can confirm the URL is live in a browser before pasting it
 * into Brevo. Brevo itself only ever POSTs.
 */
const ping = (req, res) => res.status(200).json({ ok: true });

module.exports = { handleEmailWebhook, ping };
