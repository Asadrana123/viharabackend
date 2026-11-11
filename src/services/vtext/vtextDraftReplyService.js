// services/vtext/vtextDraftReplyService.js
//
// DB/queue operations for an AI-drafted reply (Phase 7c) — the generation
// itself lives in vtextAiReplyService.js (pure, no DB writes). Rejection
// is NOT a function here: it's handled by extending the existing
// vtextMessageController.cancelMessage (CANCELLABLE_STATUSES now includes
// "pending-approval"), so there's one cancel path, not two.
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { getRouteQueue } = require("./queue/queues");
const { notifyAiReplySent } = require("./vtextAlertService");

/**
 * Creates the draft as a VtextMessage with status "pending-approval" —
 * deliberately does NOT touch the route queue (unlike enqueueOutbound).
 * @returns {Promise<object>} the created VtextMessage document
 */
async function createDraftReply({ contactId, conversationId, lineId, channelType, inboundMessageId, body, model, needsHuman, topic, bestTime, sources, retrieval, guard }) {
  return VtextMessage.create({
    direction: "out",
    contactId,
    conversationId,
    lineId,
    channelType,
    body,
    status: "pending-approval",
    // A reply to a text that came in over SMS goes back out over SMS: the default "any" would try iMessage first.
    ...(channelType === "twilio-sms" ? { channelPolicy: { mode: "only", channels: ["twilio-sms"] } } : {}),
    origin: { kind: "automation", templateKey: "ai-reply-draft", replyToMessageId: inboundMessageId },
    isReplyToInbound: true,
    aiDraft: { approvalStatus: "pending", model, generatedAt: new Date(), needsHuman: !!needsHuman, topic: topic || undefined, bestTime: bestTime || undefined, sources: sources?.length ? sources : undefined, retrieval: retrieval || undefined, guard: guard || undefined },
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
async function approveDraft(messageId, { body, approvedBy, delayMs = 0 }) {
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
  // A human-like pause before an auto-sent reply (humanReplyDelayMs). Held the same way as any scheduled text:
  // routeWorker never sends it before scheduledFor, and the stuck-message sweep leaves it alone until then.
  const wait = Math.max(0, Math.round(Number(delayMs) || 0));
  if (wait > 0) message.scheduledFor = new Date(Date.now() + wait);
  await message.save();

  await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-1`, ...(wait > 0 ? { delay: wait } : {}) });

  // Both ways a reply goes out (auto-approved and approved by an admin) end up here. Not awaited: never delays the send.
  notifyAiReplySent({ message, approvedBy });

  return message;
}

/**
 * How long an auto-sent AI reply waits before it goes out, so it does not land a few seconds after the
 * customer's text the way a bot's does. A random 20 to 50 seconds; a longer reply waits longer, as if it
 * were being typed (about 1 second per 8 characters past the first 160), up to 90 seconds.
 * Env: VTEXT_AI_REPLY_DELAY_MIN_SEC (20), VTEXT_AI_REPLY_DELAY_MAX_SEC (50), VTEXT_AI_REPLY_DELAY_LONG_MAX_SEC (90).
 * MAX 0 switches the wait off. Only for replies the AI sends on its own; an admin's approval sends at once.
 * @param {string} body - the reply text
 * @param {() => number} [random] - 0..1, for tests
 * @returns {number} milliseconds
 */
function humanReplyDelayMs(body, random = Math.random) {
  const sec = (name, fallback) => {
    const v = Number(process.env[name]);
    return process.env[name] !== undefined && process.env[name] !== "" && Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const max = sec("VTEXT_AI_REPLY_DELAY_MAX_SEC", 50);
  if (max <= 0) return 0;
  const min = Math.min(sec("VTEXT_AI_REPLY_DELAY_MIN_SEC", 20), max);
  const cap = Math.max(sec("VTEXT_AI_REPLY_DELAY_LONG_MAX_SEC", 90), max);
  const base = min + random() * (max - min);
  const typing = Math.max(0, String(body || "").length - 160) / 8;
  return Math.round(Math.min(base + typing, cap) * 1000);
}

module.exports = { createDraftReply, approveDraft, humanReplyDelayMs };
