// services/vtext/vtextLineDrainService.js
//
// Draining a line (sendify-infra.md §7.5) — called when a line goes
// quarantined/retired (auto or admin-triggered). Pulls every waiting/delayed
// job off that line's queue, releases the capacity each one had reserved,
// excludes the line so routing doesn't immediately re-pick it, and
// re-routes each message. Also marks every conversation on that line
// lineRetired and clears the contact's stickyLines entry for it, so future
// routing doesn't keep trying a dead line (vtextRouter's lazy check does
// the same marking if it discovers this before a drain runs — this is the
// explicit, immediate version).
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const { getLineQueue, getRouteQueue } = require("./queue/queues");
const capacity = require("./vtextCapacityService");

/** @param {string|import('mongoose').Types.ObjectId} lineId */
async function drainLine(lineId) {
  const queue = getLineQueue(lineId);
  const jobs = await queue.getJobs(["waiting", "delayed"]);

  let drained = 0;
  for (const job of jobs) {
    const { messageId, reservationDay } = job.data;
    await job.remove();

    const message = await VtextMessage.findById(messageId);
    if (!message || !["assigned", "sending"].includes(message.status)) continue;

    await capacity.release({ _id: lineId }, reservationDay, { wasReply: message.isReplyToInbound });

    message.excludeLineIds = [...(message.excludeLineIds || []), lineId];
    message.lineId = undefined;
    message.conversationId = undefined;
    message.status = "queued";
    await message.save();

    await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-drain-${Date.now()}` });
    drained += 1;
  }

  const conversations = await VtextConversation.find({ lineId });
  for (const conversation of conversations) {
    conversation.lineRetired = true;
    await conversation.save();

    const contact = await VtextContact.findById(conversation.contactId);
    if (contact?.stickyLines?.get(conversation.channelType)?.toString() === String(lineId)) {
      contact.stickyLines.delete(conversation.channelType);
      await contact.save();
    }
  }

  return { drainedMessages: drained, affectedConversations: conversations.length };
}

module.exports = { drainLine };
