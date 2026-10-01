// controller/sendify/sendifyMessageController.js
//
// Replaces Phase 1's temporary dev/send-direct (sendify-infra.md §9, Phase 2)
// — real sends now go through the queue via sendifyMessageService.enqueueOutbound.
const catchAsyncError = require("../../middleware/catchAsyncError");
const { enqueueOutbound } = require("../../services/sendify/sendifyMessageService");

/**
 * POST /api/v1/sendify/messages
 * Body: { to, body, channelPolicy?, isReplyToInbound?, idempotencyKey?, scheduledFor? }
 */
const sendMessage = catchAsyncError(async (req, res) => {
  const { to, body, channelPolicy, isReplyToInbound, idempotencyKey, scheduledFor } = req.body;

  const result = await enqueueOutbound({
    to,
    body,
    origin: { kind: "manual", sentBy: { adminId: req.user?._id, adminName: req.user?.name } },
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
 * Body: { recipients: [{ to, body }], batchId? }
 */
const sendBulkMessages = catchAsyncError(async (req, res) => {
  const { recipients, batchId } = req.body;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, message: "recipients must be a non-empty array" });
  }

  const resolvedBatchId = batchId || `bulk-${Date.now()}`;
  const results = [];
  for (const recipient of recipients) {
    try {
      const result = await enqueueOutbound({
        to: recipient.to,
        body: recipient.body,
        origin: { kind: "bulk", batchId: resolvedBatchId, sentBy: { adminId: req.user?._id, adminName: req.user?.name } },
      });
      results.push({ to: recipient.to, blocked: result.blocked, reason: result.reason, messageId: result.message._id });
    } catch (err) {
      results.push({ to: recipient.to, error: err.message });
    }
  }

  return res.status(202).json({ success: true, batchId: resolvedBatchId, results });
});

module.exports = { sendMessage, sendBulkMessages };
