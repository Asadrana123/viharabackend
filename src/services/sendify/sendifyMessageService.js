// services/sendify/sendifyMessageService.js
//
// The entry point every outbound send goes through (sendify-infra.md §4.3,
// top half) — normalizes the recipient, upserts the contact, runs the first
// compliance gate, persists the message, and enqueues the route job. The
// rest of the flow (routing, capacity, the actual send) happens in
// routeWorker/lineSendWorker, async, off the request.
const SendifyContact = require("../../model/sendify/sendifyContactModel");
const SendifyMessage = require("../../model/sendify/sendifyMessageModel");
const { getRouteQueue } = require("./queue/queues");
const { canSend } = require("./sendifyComplianceService");
const { toUsSmsNumber } = require("../../utils/usPhone");

function normalizeAddress(raw) {
  if (typeof raw !== "string") return null;
  if (raw.includes("@")) return raw.trim().toLowerCase();
  return toUsSmsNumber(raw);
}

/**
 * @param {object} params
 * @param {string} params.to - phone (any format) or email
 * @param {string} params.body
 * @param {object} [params.origin] - { kind, sentBy, batchId, campaignId, replyToMessageId }
 * @param {object} [params.channelPolicy] - { mode, channels }
 * @param {boolean} [params.isReplyToInbound]
 * @param {string} [params.idempotencyKey]
 * @param {Date} [params.scheduledFor]
 * @returns {Promise<{ message: object, blocked: boolean, reason?: string }>}
 */
async function enqueueOutbound({ to: rawTo, body, origin, channelPolicy, isReplyToInbound, idempotencyKey, scheduledFor }) {
  const to = normalizeAddress(rawTo);
  if (!to) {
    throw Object.assign(new Error("to is not a valid US phone number or email address"), { statusCode: 400 });
  }
  if (!body || typeof body !== "string") {
    throw Object.assign(new Error("body is required"), { statusCode: 400 });
  }

  let contact = await SendifyContact.findOne({ phoneE164: to });
  if (!contact) {
    contact = await SendifyContact.create({
      phoneE164: to,
      email: to.includes("@") ? to : undefined,
      source: origin?.kind === "manual" ? "admin" : "admin",
    });
  }

  const complianceResult = canSend(contact, { isReplyToInbound, origin });

  const message = await SendifyMessage.create({
    direction: "out",
    contactId: contact._id,
    channelType: undefined, // set once routed
    body,
    status: complianceResult.allowed ? "queued" : "blocked",
    origin: origin || { kind: "manual" },
    channelPolicy: channelPolicy || { mode: "any" },
    isReplyToInbound: !!isReplyToInbound,
    idempotencyKey: idempotencyKey || undefined,
    scheduledFor: scheduledFor || undefined,
    queuedAt: complianceResult.allowed ? new Date() : undefined,
    error: complianceResult.allowed ? undefined : { kind: complianceResult.errorKind, message: complianceResult.reason },
  });

  if (!complianceResult.allowed) {
    return { message, blocked: true, reason: complianceResult.reason };
  }

  const delay = scheduledFor ? Math.max(0, new Date(scheduledFor).getTime() - Date.now()) : 0;
  await getRouteQueue().add(
    "route",
    { messageId: String(message._id) },
    { jobId: `route-${message._id}-1`, delay }
  );

  return { message, blocked: false };
}

module.exports = { enqueueOutbound, normalizeAddress };
