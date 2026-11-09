// services/vtext/workers/lineSendWorker.js
//
// The processor bound to each per-line queue's Worker (sendify-infra.md
// §4.3, lineSendWorker section) — one actual send attempt. lineWorkerManager
// (Phase 2's simplified version, in queue/lineWorkerManager.js) creates one
// Worker per line, each calling processSendJob(lineId, job).
const { UnrecoverableError } = require("bullmq");
const VtextMessage = require("../../../model/vtext/vtextMessageModel");
const VtextContact = require("../../../model/vtext/vtextContactModel");
const VtextLine = require("../../../model/vtext/vtextLineModel");
const VtextConversation = require("../../../model/vtext/vtextConversationModel");
const { ROUTABLE_STATUSES } = VtextLine;
const { getAdapter } = require("../channels/registry");
const capacity = require("../vtextCapacityService");
const { canSend, logGateDecision } = require("../vtextComplianceService");
const { getSettings, isConsentRequired } = require("../vtextSettingsService");
const { evaluateAndMaybeQuarantine } = require("../vtextLineHealthService");
const { publishEvent } = require("../vtextEventsBus");
const smsFallback = require("../vtextSmsFallbackService");
const { recordProviderOptOut } = require("../vtextOptOutService");
const { reportTextProblem } = require("../vtextTextProblemAlert");

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
  const message = await VtextMessage.findById(messageId);
  if (!message) {
    console.warn(`[vtext line-send] message ${messageId} not found, dropping job`);
    return;
  }
  if (!["assigned", "sending"].includes(message.status)) {
    // Already handled by a terminal path elsewhere (failed/cancelled/
    // accepted/rerouted-to-queued) — don't double-send. "sending" IS allowed
    // through: that's this exact job retrying its own prior incomplete
    // attempt (set unconditionally below on every attempt, including
    // retries) — excluding it here was a real bug that silently turned every
    // "transient" error into a single, un-retried attempt (see plan).
    return;
  }

  const contact = await VtextContact.findById(message.contactId);
  const line = await VtextLine.findById(lineId).select("+credentials.iv +credentials.tag +credentials.ciphertext");

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
    // Read live, so switching consent back ON stops a queued no-consent message right here.
    { lastInboundAt: contact?.lastInboundAt, requireConsent: isConsentRequired(await getSettings()) }
  );
  logGateDecision("send", contact, complianceResult, message._id);
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

  // Twilio has no idempotency key. A message already "sending" with no recorded error was interrupted in the middle of the
  // call (stalled job, crash, restart): it may already have been queued at Twilio, so it is never sent again. A known
  // transient error (set by the catch below) means the previous attempt definitely did not go out, so that retry is fine.
  if (message.status === "sending" && line.channelType === "twilio-sms" && !message.error?.kind) {
    message.status = "failed";
    message.error = { kind: "recipient", code: "UNCERTAIN", message: "The send was interrupted, so the text may or may not have reached Twilio. It was not retried, to avoid texting the person twice." };
    message.failedAt = new Date();
    await message.save();
    await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
    publishEvent({ type: "message.updated", messageId: String(message._id), conversationId: message.conversationId ? String(message.conversationId) : null, status: message.status });
    await reportTextProblem(message);
    return;
  }

  // An SMS fallback gets a last look first: the iMessage may have been delivered meanwhile, or texting hours closed.
  if (message.fallbackOf && (await smsFallback.guardFallbackBeforeSend(message, contact, line, reservationDay))) return;

  message.status = "sending";
  if (line.channelType === "twilio-sms") message.error = undefined; // so a stall during THIS attempt is recognised on re-entry
  await message.save();

  try {
    const adapter = getAdapter(line.channelType);
    // An image goes out alone, on a line whose channel can send images. Any other line (Android) sends
    // the message's plain text instead, and the record is changed to match what was really sent.
    if (message.media?.file && !adapter.capabilities.media) {
      message.media = undefined;
      await message.save();
    }
    const result = await adapter.send({
      line,
      to: contact.phoneE164,
      body: message.body,
      media: message.media?.file ? { file: message.media.file } : undefined,
      clientMessageId: String(message._id),
    });

    message.status = "accepted";
    message.provider = { messageId: result.providerMessageId };
    if (result.segments !== undefined) message.segments = result.segments; // carrier channels (Twilio) bill per segment
    message.sentAt = new Date();
    // The channel answered with an error but found the text sent anyway (BlueBubbles on a new chat):
    // drop the error a retry left behind, and keep a delivery it already saw.
    if (result.recoveredFrom) message.error = undefined;
    if (result.deliveredAt) {
      message.status = "delivered";
      message.deliveredAt = result.deliveredAt;
    }
    await message.save();

    line.health = line.health || {};
    line.health.lastSuccessAt = new Date();
    line.health.consecutiveFailures = 0;
    await line.save();

    await capacity.recordSent(line, reservationDay);

    contact.lastOutboundAt = new Date();
    await contact.save();

    await VtextConversation.updateOne(
      { _id: message.conversationId },
      {
        $set: { lastMessageAt: new Date(), lastMessagePreview: (message.media?.label || message.body).slice(0, 120), lastDirection: "out" },
        $inc: { "counts.outbound": 1 },
      }
    );

    publishEvent({ type: "message.updated", messageId: String(message._id), conversationId: String(message.conversationId), status: message.status });
  } catch (err) {
    await capacity.recordFailed(line, reservationDay);

    if (err.kind === "recipient") {
      message.status = "failed";
      message.error = { kind: "recipient", code: err.code, message: err.message };
      message.failedAt = new Date();
      await message.save();
      await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
      publishEvent({ type: "message.updated", messageId: String(message._id), conversationId: message.conversationId ? String(message.conversationId) : null, status: message.status });
      // Twilio refused the send because this number opted out of it (21610): record that here too, so no line texts them.
      // And "not a valid mobile number" (21614) is a definite no: mark it a landline so the compliance gate stops further tries.
      try {
        if (err.code === "OPTED_OUT") await recordProviderOptOut(contact, { lineId: line._id, messageId: message._id, code: "21610" });
        else if (err.code === "TWILIO_21614" && contact.phoneStatus !== "landline") {
          contact.phoneStatus = "landline";
          await contact.save();
        }
      } catch (e) {
        console.error(`[vtext line-send] couldn't record the provider outcome for ${message._id}:`, e.message);
      }
      // BlueBubbles said the iMessage could not be delivered: the same text goes out once by SMS (when switched on).
      let fallback = null;
      if (line.channelType === smsFallback.IMESSAGE && smsFallback.isExplicitIMessageFailure(err.code)) {
        fallback = await smsFallback.maybeQueueSmsFallback(message, { trigger: "send-error", reason: err.code }).catch((e) => {
          console.error(`[vtext sms-fallback] could not queue the fallback for ${message._id}:`, e.message);
          return { queued: false, reason: `the fallback could not be queued (${e.message})` };
        });
      }
      // One Slack message for this lead's text, unless the SMS fallback is now on its way. Never throws.
      await reportTextProblem(message, { fallback });
      // Permanent — tells BullMQ not to retry this job at all.
      throw new UnrecoverableError(err.message);
    }

    if (err.kind === "line" || err.kind === "config") {
      line.health = line.health || {};
      line.health.consecutiveFailures = (line.health.consecutiveFailures || 0) + 1;
      line.health.lastFailureAt = new Date();
      await line.save();

      // "config" (auth/credentials wrong) quarantines immediately, no
      // threshold — there's no reason to let it keep failing to find out.
      // "line" goes through the normal threshold evaluation (§7.4).
      await evaluateAndMaybeQuarantine(line, err.kind === "config" ? `config error: ${err.message}` : undefined);

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
