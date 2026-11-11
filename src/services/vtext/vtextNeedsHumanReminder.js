// services/vtext/vtextNeedsHumanReminder.js
//
// A customer the AI handed to the team ("Needs a human") must not be left waiting. When a flagged conversation
// still has no team reply, Slack gets a reminder: one after 30 minutes, a last one after 2 hours, then nothing
// more (no Slack spam). It only nudges the team: it never texts the customer.
//
// "Replied" means the flag is off: someone texted them from the Inbox (vtextMessageService clears it on a manual
// send) or clicked "Mark handled". The clock starts when the flag goes on (draftReplyWorker sets needsHumanAt).
// A conversation flagged before this existed has no needsHumanAt and is left alone, so a deploy posts no backlog.
//
// Run every 10 minutes by the maintenance worker ("needs-human-reminder"). Never throws.
// Env: VTEXT_NEEDS_HUMAN_REMIND_MIN (30), VTEXT_NEEDS_HUMAN_FINAL_REMIND_MIN (120).
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const Product = require("../../model/property/productModel");
const slack = require("../shared/slackService"); // looked up at call time (tests replace it)
const { inboxUrl, clip } = require("./vtextAlertService");

const minutes = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const firstAfterMin = () => minutes("VTEXT_NEEDS_HUMAN_REMIND_MIN", 30);
const finalAfterMin = () => Math.max(minutes("VTEXT_NEEDS_HUMAN_FINAL_REMIND_MIN", 120), firstAfterMin());
const MAX_PER_RUN = 50;

/** Which reminder is due now: 1 (the first), 2 (the last) or 0 (none). Pure. */
function dueReminder(conversation, now = new Date()) {
  if (!conversation?.needsHuman || !conversation.needsHumanAt) return 0;
  const waitedMin = (new Date(now).getTime() - new Date(conversation.needsHumanAt).getTime()) / 60_000;
  const sent = conversation.needsHumanReminders || 0;
  if (sent < 2 && waitedMin >= finalAfterMin()) return 2;
  if (sent < 1 && waitedMin >= firstAfterMin()) return 1;
  return 0;
}

/** "35 minutes", "2 hours 5 minutes". Pure. */
function waitedWords(fromDate, now = new Date()) {
  const total = Math.max(0, Math.round((new Date(now).getTime() - new Date(fromDate).getTime()) / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const part = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!h) return part(m, "minute");
  return m ? `${part(h, "hour")} ${part(m, "minute")}` : part(h, "hour");
}

async function postReminder(conversation, which, now) {
  const [contact, lastIn, lastFlagged, product] = await Promise.all([
    VtextContact.findById(conversation.contactId).select("name phoneE164").lean(),
    VtextMessage.findOne({ conversationId: conversation._id, direction: "in" }).sort({ createdAt: -1 }).select("body").lean(),
    VtextMessage.findOne({ conversationId: conversation._id, "aiDraft.needsHuman": true }).sort({ createdAt: -1 }).select("aiDraft.topic").lean(),
    conversation.propertyId ? Product.findById(conversation.propertyId).select("street city").lean() : null,
  ]);
  const waited = waitedWords(conversation.needsHumanAt, now);
  await slack.notifyVtextAlert({
    level: "warning",
    icon: "⏰",
    title: which === 2 ? `Still no reply after ${waited} (last reminder)` : `Still waiting for a reply after ${waited}`,
    fields: [
      { label: "Contact", value: contact?.name || "(no name)" },
      { label: "Phone", value: contact?.phoneE164 },
      { label: "Property", value: product ? [product.street, product.city].filter(Boolean).join(", ") : undefined },
      { label: "Topic", value: lastFlagged?.aiDraft?.topic },
      { label: "Best time to reach them", value: conversation.bestTimeToReach },
      { label: "Their last text", value: clip(lastIn?.body, 300), wide: true },
      { label: "What to do", value: "Text them from the Inbox, or click Mark handled if it's already done.", wide: true },
      { label: "Inbox", value: `<${inboxUrl(conversation._id)}|Open the conversation>`, wide: true },
    ],
  });
}

/** @returns {Promise<{ checked: number, sent: number }>} */
async function runNeedsHumanReminders({ now = new Date() } = {}) {
  const out = { checked: 0, sent: 0 };
  try {
    const cutoff = new Date(new Date(now).getTime() - firstAfterMin() * 60_000);
    const waiting = await VtextConversation.find({ needsHuman: true, needsHumanAt: { $lte: cutoff }, needsHumanReminders: { $lt: 2 } })
      .select("contactId propertyId needsHuman needsHumanAt needsHumanReminders bestTimeToReach")
      .sort({ needsHumanAt: 1 })
      .limit(MAX_PER_RUN)
      .lean();
    for (const c of waiting) {
      out.checked += 1;
      const which = dueReminder(c, now);
      if (!which) continue;
      // Claim it first, so two workers never post the same reminder; a conversation handled meanwhile is skipped.
      const claim = await VtextConversation.updateOne(
        { _id: c._id, needsHuman: true, needsHumanReminders: c.needsHumanReminders || 0 },
        { $set: { needsHumanReminders: which } }
      );
      if (!claim.modifiedCount) continue;
      await postReminder(c, which, now).catch((err) => console.error("[vtext needs-human] could not post a reminder:", err.message));
      out.sent += 1;
    }
  } catch (err) {
    console.error("[vtext needs-human] reminder run failed:", err.message);
  }
  return out;
}

module.exports = { runNeedsHumanReminders, dueReminder, waitedWords };
