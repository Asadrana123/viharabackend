// controller/vtext/vtextWebhookController.js
//
// Public endpoint (sendify-infra.md §6.1) — BlueBubbles (or any future
// channel) pushes inbound events here. The per-line webhookKey in the URL
// path is the security boundary (same "URL is the secret" pattern as
// brevoWebhookController.js), backed up by adapter.verifyWebhook() where the
// provider actually supports signing.
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextWebhookEvent = require("../../model/vtext/vtextWebhookEventModel");
const { getAdapter } = require("../../services/vtext/channels/registry");
const { getInboundQueue } = require("../../services/vtext/queue/queues");

const ALLOW_UNSIGNED = process.env.VTEXT_ALLOW_UNSIGNED_WEBHOOKS === "true";

/**
 * POST /api/webhooks/vtext/:channelType/:lineKey
 */
const receive = catchAsyncError(async (req, res) => {
  const { channelType, lineKey } = req.params;

  const line = await VtextLine.findOne({ webhookKey: lineKey }).select("+credentials.iv +credentials.tag +credentials.ciphertext");
  if (!line || line.channelType !== channelType) {
    console.warn(`[vtext webhook] unknown line or channel mismatch: channelType=${channelType} lineKey=${lineKey.slice(0, 8)}...`);
    return res.status(404).json({ success: false, message: "Not found" });
  }

  const adapter = getAdapter(channelType);
  let signatureValid = null;
  try {
    signatureValid = adapter.verifyWebhook({ rawBody: req.rawBody, headers: req.headers, query: req.query, line });
  } catch (err) {
    signatureValid = false;
  }

  if (!signatureValid) {
    const failClosed = process.env.NODE_ENV === "production" || !ALLOW_UNSIGNED;
    if (failClosed) {
      console.warn(`[vtext webhook] signature verification failed for line ${line._id}`);
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    console.warn(`[vtext webhook] signature verification failed for line ${line._id} — allowed through (VTEXT_ALLOW_UNSIGNED_WEBHOOKS=true, non-production)`);
  }

  // Whitelist, never store raw auth headers (schema comment on vtextWebhookEventModel).
  const safeHeaders = {
    "content-type": req.headers["content-type"],
    "user-agent": req.headers["user-agent"],
  };

  const webhookEvent = await VtextWebhookEvent.create({
    channelType,
    lineId: line._id,
    lineKey,
    headers: safeHeaders,
    body: req.body,
    signatureValid: !!signatureValid,
    processed: false,
  });

  // Deterministic-enough id for dedupe within a short window; a true provider
  // event id (when parseWebhook can extract one) is used downstream in
  // inboundWorker for the real per-message dedupe against vtextMessageModel.
  const jobId = `in-${channelType}-${webhookEvent._id}`;
  const job = await getInboundQueue().add("inbound", { webhookEventId: String(webhookEvent._id) }, { jobId });
  webhookEvent.jobId = job.id;
  await webhookEvent.save();

  return res.status(200).json({ success: true });
});

/** GET /api/webhooks/vtext/:channelType/:lineKey — ping, so the URL can be confirmed live before pasting it into BlueBubbles. */
const ping = catchAsyncError(async (req, res) => {
  const { channelType, lineKey } = req.params;
  const line = await VtextLine.findOne({ webhookKey: lineKey });
  if (!line || line.channelType !== channelType) {
    return res.status(404).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
});

module.exports = { receive, ping };
