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
  notifyOptOut({
    contact,
    how: `Twilio says they texted STOP to our SMS number at some point (Twilio ${code})`,
    cancelledCount: cancelled,
    lineName: lineId ? (await VtextLine.findById(lineId).select("name").lean().catch(() => null))?.name : undefined,
  });
  return { changed: true, cancelled };
}

/**
 * 🚫 One Slack message when someone opts out: who, how, what they wrote, which of our texts they were answering,
 * and what was stopped. Fire-and-forget, never throws.
 */
function notifyOptOut({ contact, how, theirMessage, lineName, cancelledCount, conversationId }) {
  (async () => {
    const { inboxUrl, clip } = require("./vtextAlertService");
    const { whichText } = require("./vtextTextProblemAlert");
    const lastOut = await VtextMessage.findOne({ contactId: contact._id, direction: "out", "origin.kind": { $ne: "system" }, status: { $in: ["accepted", "sent", "delivered", "read"] } })
      .sort({ createdAt: -1 })
      .select("origin fallbackOf")
      .lean()
      .catch(() => null);
    await notifyVtextAlert({
      level: "info",
      icon: "🚫",
      title: "Lead opted out",
      fields: [
        { label: "Lead", value: contact.name || "(no name)" },
        { label: "Phone", value: contact.phoneE164 },
        { label: "How", value: how },
        { label: "Last text we sent", value: lastOut ? whichText(lastOut) : undefined },
        { label: "Line", value: lineName },
        { label: "Stopped", value: cancelledCount ? `${cancelledCount} queued text${cancelledCount === 1 ? "" : "s"} cancelled` : "Nothing was queued" },
        theirMessage ? { label: "What they wrote", value: clip(theirMessage, 300), wide: true } : null,
        { label: "What it means", value: "Vtext will not text them again unless they text START.", wide: true },
        conversationId ? { label: "Inbox", value: `<${inboxUrl(conversationId)}|Open the conversation>`, wide: true } : null,
      ].filter(Boolean),
    });
  })().catch((err) => console.error("[vtext opt-out] could not send the opt-out alert:", err.message));
}

module.exports = { cancelPendingOutbound, recordProviderOptOut, notifyOptOut };
