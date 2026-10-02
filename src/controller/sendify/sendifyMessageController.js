// controller/sendify/sendifyMessageController.js
//
// Replaces Phase 1's temporary dev/send-direct (sendify-infra.md §9, Phase 2)
// — real sends now go through the queue via sendifyMessageService.enqueueOutbound.
const catchAsyncError = require("../../middleware/catchAsyncError");
const { enqueueOutbound } = require("../../services/sendify/sendifyMessageService");
const { renderTemplateForProperty } = require("../../services/sendify/sendifyTemplateService");
const SendifyMessage = require("../../model/sendify/sendifyMessageModel");
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const capacity = require("../../services/sendify/sendifyCapacityService");
const { getRouteQueue, getLineQueue } = require("../../services/sendify/queue/queues");

const CANCELLABLE_STATUSES = ["queued", "waiting-window", "waiting-capacity", "assigned"];

/**
 * POST /api/v1/sendify/messages
 * Body: { to, body, channelPolicy?, isReplyToInbound?, idempotencyKey?, scheduledFor? }
 * OR:   { to, templateId, propertyId, ... } — body rendered from the template+property instead of typed directly.
 */
const sendMessage = catchAsyncError(async (req, res) => {
  const { to, templateId, propertyId, channelPolicy, isReplyToInbound, idempotencyKey, scheduledFor } = req.body;
  let { body } = req.body;

  const origin = { kind: "manual", sentBy: { adminId: req.user?._id, adminName: req.user?.name } };
  if (!body && templateId) {
    const rendered = await renderTemplateForProperty(templateId, propertyId);
    body = rendered.body;
    origin.campaignId = templateId;
  }

  const result = await enqueueOutbound({
    to,
    body,
    origin,
    channelPolicy,
    isReplyToInbound,
    idempotencyKey,
    scheduledFor,
  });

  return res.status(result.blocked ? 200 : 202).json({
    success: true,
    blocked: result.blocked,
    reason: result.reason,
    message: result.message,
  });
});

/**
 * POST /api/v1/sendify/messages/bulk
 * Either body: { recipients: [{ to, body }], batchId? } — a body per recipient, or
 *       body: { to: [phoneNumbers], templateId, propertyId, batchId? } — one template+property
 *             rendered ONCE and sent as-is to every number (the Send tab's bulk-from-template flow).
 */
const sendBulkMessages = catchAsyncError(async (req, res) => {
  const { recipients, to, templateId, propertyId, batchId } = req.body;

  let resolvedRecipients = recipients;
  let origin = { kind: "bulk" };

  if (!Array.isArray(resolvedRecipients) || resolvedRecipients.length === 0) {
    if (!Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ success: false, message: "Provide either recipients (with per-recipient body) or to (phone numbers) + templateId + propertyId" });
    }
    const { body } = await renderTemplateForProperty(templateId, propertyId);
    resolvedRecipients = to.map((phone) => ({ to: phone, body }));
    origin.campaignId = templateId;
  }

  const resolvedBatchId = batchId || `bulk-${Date.now()}`;
  origin.batchId = resolvedBatchId;
  origin.sentBy = { adminId: req.user?._id, adminName: req.user?.name };

  const results = [];
  for (const recipient of resolvedRecipients) {
    try {
      const result = await enqueueOutbound({ to: recipient.to, body: recipient.body, origin });
      results.push({ to: recipient.to, blocked: result.blocked, reason: result.reason, messageId: result.message._id });
    } catch (err) {
      results.push({ to: recipient.to, error: err.message });
    }
  }

  return res.status(202).json({ success: true, batchId: resolvedBatchId, results });
});

/** GET /api/v1/sendify/messages?status=failed|waiting-capacity|unknown&limit= — the Failed/Backlog tab's data source. */
const listMessagesByStatus = catchAsyncError(async (req, res) => {
  const { status } = req.query;
  if (!status) return res.status(400).json({ success: false, message: "status is required" });

  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const statuses = status.split(",");
  const messages = await SendifyMessage.find({ status: { $in: statuses } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .populate("contactId", "name phoneE164")
    .populate("lineId", "name address");

  return res.status(200).json({ success: true, messages });
});

/** POST /api/v1/sendify/messages/:id/retry — a clean re-route attempt: clears excludeLineIds/attempts so a since-recovered line is eligible again. */
const retryMessage = catchAsyncError(async (req, res) => {
  const message = await SendifyMessage.findById(req.params.id);
  if (!message) return res.status(404).json({ success: false, message: "Message not found" });
  if (!["failed", "unknown", "cancelled", "blocked"].includes(message.status)) {
    return res.status(400).json({ success: false, message: `Message is "${message.status}" — only terminal (failed/unknown/cancelled/blocked) messages can be retried` });
  }

  message.status = "queued";
  message.excludeLineIds = [];
  message.attempts = 0;
  message.error = undefined;
  message.lineId = undefined;
  message.conversationId = undefined;
  await message.save();

  await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-retry-${Date.now()}` });

  return res.status(200).json({ success: true, message });
});

/** POST /api/v1/sendify/messages/:id/cancel */
const cancelMessage = catchAsyncError(async (req, res) => {
  const message = await SendifyMessage.findById(req.params.id);
  if (!message) return res.status(404).json({ success: false, message: "Message not found" });
  if (!CANCELLABLE_STATUSES.includes(message.status)) {
    return res.status(400).json({ success: false, message: `Message is "${message.status}" — can't cancel something already sent or already terminal` });
  }

  if (message.status === "assigned" && message.lineId) {
    try {
      const job = await getLineQueue(message.lineId).getJob(`send-${message._id}`);
      if (job) await job.remove();
    } catch {
      // best-effort — the status flip below is what actually stops a send either way
    }
    const line = await SendifyLine.findById(message.lineId);
    if (line) await capacity.release(line, capacity.dayKey(message.updatedAt), { wasReply: message.isReplyToInbound });
  }

  message.status = "cancelled";
  await message.save();

  return res.status(200).json({ success: true, message });
});

/** POST /api/v1/sendify/messages/:id/reroute — forces an immediate re-route attempt (skips any pending delay), optionally excluding the line it's currently stuck on. */
const rerouteMessage = catchAsyncError(async (req, res) => {
  const message = await SendifyMessage.findById(req.params.id);
  if (!message) return res.status(404).json({ success: false, message: "Message not found" });
  if (!["waiting-capacity", "waiting-window", "assigned"].includes(message.status)) {
    return res.status(400).json({ success: false, message: `Message is "${message.status}" — nothing to reroute` });
  }

  if (req.body?.excludeCurrentLine && message.lineId) {
    message.excludeLineIds = [...(message.excludeLineIds || []), message.lineId];
  }
  message.status = "queued";
  message.lineId = undefined;
  message.conversationId = undefined;
  await message.save();

  await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-reroute-${Date.now()}` });

  return res.status(200).json({ success: true, message });
});

module.exports = { sendMessage, sendBulkMessages, listMessagesByStatus, retryMessage, cancelMessage, rerouteMessage };
