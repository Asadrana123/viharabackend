// controller/sendblueWebhookController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const {
  saveInboundMessage,
  autoReplyToFirstInbound,
} = require("../services/sendblueService");

// Sendblue lets you configure a secret for the webhook. We treat the endpoint
// URL + a shared secret as the security boundary — the same approach as the
// Brevo and VAPI webhooks in this codebase. The secret may arrive as ?secret=…
// on the URL, or in one of Sendblue's header variants. If SENDBLUE_WEBHOOK_SECRET
// is unset, the check is skipped (with a warning) so the endpoint works before
// you've configured the secret — graceful-degrade, matching brevoWebhookController.
const WEBHOOK_SECRET = process.env.SENDBLUE_WEBHOOK_SECRET || "";

const isAuthorized = (req) => {
  if (!WEBHOOK_SECRET) {
    console.warn("⚠️  SENDBLUE_WEBHOOK_SECRET unset — Sendblue webhook is unauthenticated.");
    return true;
  }
  const provided =
    req.query.secret ||
    req.get("sb-secret") ||
    req.get("x-webhook-secret") ||
    req.get("sb-signing-secret") ||
    "";
  return provided === WEBHOOK_SECRET;
};

/**
 * POST /api/webhooks/sendblue/receive   (public — Sendblue pushes here)
 *
 * 1. Save the inbound text (idempotent on message_handle).
 * 2. Answer 200 immediately so Sendblue doesn't retry.
 * 3. Fire-and-forget: if this is a genuinely NEW, inbound, first-ever text from
 *    this number, Maya auto-replies with the keyword-matched greeting. The
 *    is_outbound guard means our own replies never trigger another reply, and the
 *    isNew guard means a retried webhook can't double-send.
 *
 * A real DB error in step 1 throws → catchAsyncError → 500, which is exactly when
 * we WANT Sendblue to retry.
 */
const handleInboundWebhook = catchAsyncError(async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const payload = req.body || {};
  const result = await saveInboundMessage(payload);
  res.status(200).json({ success: true, ...result });

  if (result.saved && result.isNew && !payload.is_outbound) {
    autoReplyToFirstInbound({
      contact: payload.number || payload.from_number || "",
      content: payload.content || "",
      sendblueNumber: payload.sendblue_number || payload.to_number || "",
    }).catch((e) => console.error("[sendblue-autoreply] dispatch failed:", e.message));
  }
});

/**
 * GET /api/webhooks/sendblue/receive
 * Health check so you can confirm the URL is live in a browser before pasting it
 * into the Sendblue dashboard. Sendblue itself only ever POSTs.
 */
const ping = (req, res) => res.status(200).json({ ok: true });

module.exports = { handleInboundWebhook, ping };
