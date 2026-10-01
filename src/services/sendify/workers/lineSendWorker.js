// services/sendify/workers/lineSendWorker.js
//
// The processor bound to each per-line queue's Worker (sendify-infra.md
// §4.3, lineSendWorker section) — one actual send attempt. lineWorkerManager
// (Phase 2's simplified version, in queue/lineWorkerManager.js) creates one
// Worker per line, each calling processSendJob(lineId, job).
const { UnrecoverableError } = require("bullmq");
const SendifyMessage = require("../../../model/sendify/sendifyMessageModel");
const SendifyContact = require("../../../model/sendify/sendifyContactModel");
const SendifyLine = require("../../../model/sendify/sendifyLineModel");
const SendifyConversation = require("../../../model/sendify/sendifyConversationModel");
const { ROUTABLE_STATUSES } = SendifyLine;
const { getAdapter } = require("../channels/registry");
const capacity = require("../sendifyCapacityService");
const { canSend } = require("../sendifyComplianceService");

async function rerouteExcluding(message, lineId) {
  message.excludeLineIds = [...(message.excludeLineIds || []), lineId];
  message.lineId = undefined;
  message.conversationId = undefined;
  message.status = "queued";
  await message.save();
  const { getRouteQueue } = require("../queue/queues");
  await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-${Date.now()}` });
}

/**
 * @param {string} lineId - which line's queue this job came from (the Worker is already scoped to one queue, but the job data doesn't carry it, so lineWorkerManager passes it in via closure)
 * @param {import('bullmq').Job} job - data: { messageId, reservationDay }
 */
async function processSendJob(lineId, job) {
  const { messageId, reservationDay } = job.data;
  const message = await SendifyMessage.findById(messageId);
  if (!message) {
    console.warn(`[sendify line-send] message ${messageId} not found, dropping job`);
    return;
  }
  if (message.status !== "assigned") {
    // Already handled (e.g. a retried job after a prior attempt already
    // terminal-failed/succeeded) — don't double-send.
    return;
  }

  const contact = await SendifyContact.findById(message.contactId);
  const line = await SendifyLine.findById(lineId).select("+credentials.iv +credentials.tag +credentials.ciphertext");

  // GATE #3 — opt-out (or anything else) could have changed between routing
  // and this send. Goes through the SAME canSend() as gates #1/#2, not a
  // separate hardcoded opt-out check — a standalone `if (optOut) cancel`
  // here had no system-bypass awareness at all, so a stop-confirm reply
  // (deliberately sent to a now-opted-out contact, by design) sailed through
  // gates #1/#2 only to get silently cancelled right here, at the last
  // possible step, with no error anywhere pointing at why. One gate
  // definition, reused three times, is what actually keeps that from
  // happening again.
  const complianceResult = canSend(
    contact,
    { isReplyToInbound: message.isReplyToInbound, origin: message.origin },
    { lastInboundAt: contact?.lastInboundAt }
  );
  if (!complianceResult.allowed) {
    message.status = "cancelled";
    await message.save();
    await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
    return;
  }

  if (!line || !ROUTABLE_STATUSES.includes(line.status)) {
    await capacity.release(line || { _id: lineId }, reservationDay, { wasReply: message.isReplyToInbound });
    await rerouteExcluding(message, lineId);
    return;
  }

  message.status = "sending";
  await message.save();

  try {
    const adapter = getAdapter(line.channelType);
    const result = await adapter.send({ line, to: contact.phoneE164, body: message.body, clientMessageId: String(message._id) });

    message.status = "accepted";
    message.provider = { messageId: result.providerMessageId };
    message.sentAt = new Date();
    await message.save();

    line.health = line.health || {};
    line.health.lastSuccessAt = new Date();
    line.health.consecutiveFailures = 0;
    await line.save();

    await capacity.recordSent(line, reservationDay);

    contact.lastOutboundAt = new Date();
    await contact.save();

    await SendifyConversation.updateOne(
      { _id: message.conversationId },
      {
        $set: { lastMessageAt: new Date(), lastMessagePreview: message.body.slice(0, 120), lastDirection: "out" },
        $inc: { "counts.outbound": 1 },
      }
    );
  } catch (err) {
    await capacity.recordFailed(line, reservationDay);

    if (err.kind === "recipient") {
      message.status = "failed";
      message.error = { kind: "recipient", code: err.code, message: err.message };
      message.failedAt = new Date();
      await message.save();
      await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
      // Permanent — tells BullMQ not to retry this job at all.
      throw new UnrecoverableError(err.message);
    }

    if (err.kind === "line" || err.kind === "config") {
      line.health = line.health || {};
      line.health.consecutiveFailures = (line.health.consecutiveFailures || 0) + 1;
      line.health.lastFailureAt = new Date();
      await line.save();
      // Quarantine evaluation (auto-pull-out past a failure threshold) is
      // Phase 4 (sendify-infra.md §7.4) — this just tracks the count for now.
      await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
      await rerouteExcluding(message, lineId);
      return;
    }

    // "transient" (or anything unclassified) — let BullMQ retry with backoff.
    // capacity stays reserved across retries; released only on a final,
    // definitive outcome (success, permanent failure, or reroute).
    message.attempts = (message.attempts || 0) + 1;
    message.error = { kind: err.kind || "transient", code: err.code, message: err.message };
    await message.save();
    throw err;
  }
}

module.exports = { processSendJob };
