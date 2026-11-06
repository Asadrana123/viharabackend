// services/vtext/vtextOptOutService.js
//
// Opt-out bookkeeping shared by the inbound worker (a STOP reply) and the send path (Twilio reporting that a number
// opted out). An opt-out lives on the CONTACT, so it blocks every line and every channel at once (canSend).
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const capacity = require("./vtextCapacityService");
const { notifyVtextAlert } = require("../shared/slackService");

async function cancelPendingOutbound(contactId, { onlyFollowUps = false } = {}) {
  const pending = await VtextMessage.find({
    contactId,
    direction: "out",
    status: { $in: ["queued", "waiting-window", "waiting-capacity", "assigned", "pending-approval"] },
    ...(onlyFollowUps ? { "origin.templateKey": /^followup-/ } : {}),
  });

  for (const message of pending) {
    // A pending AI draft never reached the route queue, so there's no line
    // job or capacity reservation to undo for it — just reject it below.
    if (message.status === "pending-approval") {
      message.status = "cancelled";
      if (message.aiDraft) message.aiDraft.approvalStatus = "rejected";
      await message.save();
      continue;
    }

    // Best-effort job removal — the message's own status flip is what
    // actually stops it from sending even if a stale job slips through
    // (routeWorker/lineSendWorker both check status before doing anything).
    try {
      if (message.lineId) {
        const { getLineQueue } = require("./queue/queues");
        const job = await getLineQueue(message.lineId).getJob(`send-${message._id}`);
        if (job) await job.remove();
      }
    } catch (err) {
      console.warn(`[vtext inbound] couldn't remove line-queue job for message ${message._id}:`, err.message);
    }

    if (message.status === "assigned" && message.lineId) {
      const line = await VtextLine.findById(message.lineId);
      if (line) await capacity.release(line, capacity.dayKey(message.updatedAt), { wasReply: message.isReplyToInbound });
    }

    message.status = "cancelled";
    await message.save();
  }

  return pending.length;
}

/**
 * Twilio told us this number has opted out (a send came back 21610, or its receipt did): the person texted STOP to our
 * Twilio number at some point and Twilio now blocks every send. Mirror that on our side so no line texts them either.
 * Does nothing when the contact is already opted out.
 * @returns {Promise<{ changed: boolean, cancelled?: number }>}
 */
async function recordProviderOptOut(contact, { lineId, messageId, code = "21610" } = {}) {
  if (!contact || contact.optOut?.isOptedOut) return { changed: false };

  contact.optOut = { isOptedOut: true, at: new Date(), keyword: code, method: "provider", viaLineId: lineId, viaMessageId: messageId };
  contact.consent.status = "opted-out";
  contact.consentEvents.push({ type: "opt-out", at: new Date(), method: "provider", keyword: code, messageId, lineId });
  await contact.save();

  const cancelled = await cancelPendingOutbound(contact._id);
  notifyVtextAlert({
    level: "info",
    title: "Contact opted out (reported by Twilio)",
    fields: [
      { label: "Contact", value: contact.phoneE164 },
      { label: "Twilio error", value: code },
      { label: "Cancelled pending sends", value: cancelled },
    ],
  }).catch(() => {});
  return { changed: true, cancelled };
}

module.exports = { cancelPendingOutbound, recordProviderOptOut };
