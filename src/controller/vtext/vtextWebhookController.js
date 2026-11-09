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
const { publicBaseUrl } = require("../../services/vtext/vtextWebhookUrl");

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
    // `url` is the exact public URL the provider called (Twilio signs it). Null when VTEXT_PUBLIC_BASE_URL is unset, which makes a signing provider fail closed.
    const base = publicBaseUrl();
    const url = base ? `${base}${req.originalUrl}` : null;
    signatureValid = adapter.verifyWebhook({ rawBody: req.rawBody, headers: req.headers, query: req.query, body: req.body, url, line });
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
    "i-twilio-idempotency-token": req.headers["i-twilio-idempotency-token"], // lets a retried Twilio delivery be recognised
  };

  const webhookEvent = await VtextWebhookEvent.create({
    channelType,
    lineId: line._id,
    lineKey,
    headers: safeHeaders,
    body: req.body,
    query: req.query,
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

  // Most providers want any 200. Twilio wants TwiML (an empty <Response/> = no automatic reply).
  const custom = adapter.webhookResponse?.();
  if (custom) return res.status(custom.status).type(custom.contentType).send(custom.body);
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

/**
 * POST /api/webhooks/vtext/:channelType/:lineKey/missing — for the dasd watchdog on the Mac (tools/mac-watchdog).
 * The Mac sends the ids of replies it received a few minutes ago; we answer which of them never reached us.
 * Any missing one means BlueBubbles has stalled on the Mac (macOS 27 dasd bug), and the watchdog restarts dasd.
 * Also says when the backend's own catch-up last found missed replies, which is the same signal arriving later.
 * Read-only. Same security boundary as the webhook: the per-line key in the URL. Answers only about the ids sent.
 */
const missing = catchAsyncError(async (req, res) => {
  const { channelType, lineKey } = req.params;
  const line = await VtextLine.findOne({ webhookKey: lineKey }).select("_id channelType").lean();
  if (!line || line.channelType !== channelType) return res.status(404).json({ ok: false });

  const guids = Array.isArray(req.body?.guids) ? req.body.guids.filter((g) => typeof g === "string" && g.length < 200).slice(0, 200) : [];
  const VtextMessage = require("../../model/vtext/vtextMessageModel");
  const { getAlertWatermark } = require("../../services/vtext/vtextAlertService");
  const known = guids.length
    ? new Set(await VtextMessage.find({ channelType, direction: "in", "provider.messageId": { $in: guids } }).distinct("provider.messageId"))
    : new Set();
  const missedRepliesFoundAt = await getAlertWatermark("bbMissedReplyAt");
  return res.status(200).json({ ok: true, missing: guids.filter((g) => !known.has(g)), missedRepliesFoundAt });
});

module.exports = { receive, ping, missing };
