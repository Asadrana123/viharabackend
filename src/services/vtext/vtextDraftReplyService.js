// services/vtext/vtextDraftReplyService.js
//
// DB/queue operations for an AI-drafted reply (Phase 7c) — the generation
// itself lives in vtextAiReplyService.js (pure, no DB writes). Rejection
// is NOT a function here: it's handled by extending the existing
// vtextMessageController.cancelMessage (CANCELLABLE_STATUSES now includes
// "pending-approval"), so there's one cancel path, not two.
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { getRouteQueue } = require("./queue/queues");

/**
 * Creates the draft as a VtextMessage with status "pending-approval" —
 * deliberately does NOT touch the route queue (unlike enqueueOutbound).
 * @returns {Promise<object>} the created VtextMessage document
 */
async function createDraftReply({ contactId, conversationId, lineId, channelType, inboundMessageId, body, model, needsHuman, topic }) {
  return VtextMessage.create({
    direction: "out",
    contactId,
    conversationId,
    lineId,
    channelType,
    body,
    status: "pending-approval",
    origin: { kind: "automation", templateKey: "ai-reply-draft", replyToMessageId: inboundMessageId },
    isReplyToInbound: true,
    aiDraft: { approvalStatus: "pending", model, generatedAt: new Date(), needsHuman: !!needsHuman, topic: topic || undefined },
  });
}

/**
 * Approves a pending draft (as-is, or with an edited body) and hands it to
 * the route queue — same enqueue call enqueueOutbound itself uses. No
 * separate compliance re-check here: routeWorker.js's own Gate #2 already
 * re-runs canSend() at route time, which catches a STOP that arrived
 * between the draft being created and this approval.
 * @param {string} messageId
 * @param {object} params
 * @param {string} [params.body] - an edited draft body; omitted/unchanged -> "approved", changed -> "edited"
 * @param {object} params.approvedBy - { adminId, adminName }
 * @returns {Promise<object>} the updated VtextMessage document
 */
async function approveDraft(messageId, { body, approvedBy }) {
  const message = await VtextMessage.findById(messageId);
  if (!message) throw new Error("Message not found");
  if (message.status !== "pending-approval") {
    throw new Error(`Message is "${message.status}" — only a pending draft can be approved`);
  }

  const edited = body !== undefined && body !== message.body;
  if (edited) message.body = body;

  message.status = "queued";
  message.queuedAt = new Date();
  message.aiDraft.approvalStatus = edited ? "edited" : "approved";
  message.aiDraft.approvedBy = approvedBy;
  message.aiDraft.approvedAt = new Date();
  await message.save();

  await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-1` });

  return message;
}

module.exports = { createDraftReply, approveDraft };
