// services/vtext/vtextLeadMessagesService.js
//
// Phase 7a (sendify-infra.md) — feeds the Leads tab's LeadTextActivity.jsx,
// which has been built and wired into LeadDetailModal.jsx since before
// Vtext existed but has always rendered empty, since nothing ever
// populated `lead.messages`. This is the read side: given a batch of lead
// phone numbers, return their Vtext conversation history grouped by
// phone, in the EXACT shape LeadTextActivity.jsx already expects
// ({ direction: 'outbound'|'inbound', content, mediaUrl, sentAt, service }) —
// chosen deliberately so that component needs zero changes.
//
// Mirrors vapiCallsService.getCallsForPhones / emailEventsService.getEmailEventsForEmails:
// same best-effort contract (a DB error returns {} so the admin leads list
// still renders, just with empty `messages`, same as calls/emails already do).
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { normalisePhone } = require("../calling/vapiCallsService");

const CHANNEL_LABEL = {
  "imessage-bluebubbles": "iMessage",
  "android-sms": "SMS",
  mock: "test",
};

function mapMessage(m) {
  const isOut = m.direction === "out";
  return {
    _id: m._id,
    direction: isOut ? "outbound" : "inbound",
    content: m.body || "",
    sentAt: isOut ? m.sentAt || m.createdAt : m.receivedAt || m.createdAt,
    service: CHANNEL_LABEL[m.channelType] || m.channelType || "text",
    // Delivery info is only meaningful for our own texts. readAt is set only
    // when the recipient has read receipts on, so a missing readAt is not "unread".
    ...(isOut ? { status: m.status, deliveredAt: m.deliveredAt || null, readAt: m.readAt || null, error: m.error?.message || null } : {}),
  };
}

/**
 * @param {string[]} phones - raw lead phone numbers (any format normalisePhone accepts)
 * @returns {Promise<Record<string, object[]>>} { "+1XXXXXXXXXX": [messages oldest→newest] }
 */
async function getVtextMessagesForPhones(phones = []) {
  const unique = [...new Set((phones || []).map(normalisePhone).filter(Boolean))];
  if (!unique.length) return {};

  let contacts = [];
  try {
    contacts = await VtextContact.find({ phoneE164: { $in: unique } }).select("_id phoneE164").lean();
  } catch (err) {
    console.error("[vtext lead messages] contact lookup failed:", err.message);
    return {};
  }
  if (!contacts.length) return {};

  const phoneByContactId = {};
  for (const c of contacts) phoneByContactId[String(c._id)] = c.phoneE164;

  let messages = [];
  try {
    messages = await VtextMessage.find({ contactId: { $in: contacts.map((c) => c._id) } })
      .select("contactId direction body channelType status sentAt deliveredAt readAt receivedAt createdAt error")
      .sort({ createdAt: 1 }) // oldest -> newest, same order LeadTextActivity.jsx's own header comment expects
      .lean();
  } catch (err) {
    console.error("[vtext lead messages] message lookup failed:", err.message);
    return {};
  }

  const byPhone = {};
  for (const m of messages) {
    const phone = phoneByContactId[String(m.contactId)];
    if (!phone) continue;
    (byPhone[phone] = byPhone[phone] || []).push(mapMessage(m));
  }
  return byPhone;
}

// Outbound statuses that count as "we texted them" / "the text did not go". Anything else (cancelled, an
// AI draft waiting for approval) is neither.
const TEXTED_STATUSES = ["queued", "waiting-window", "waiting-capacity", "assigned", "sending", "accepted", "sent", "delivered", "read"];
const NOT_SENT_STATUSES = ["failed", "blocked", "unknown"];

/**
 * Light text state per lead phone, for the Leads tab's text filter (the summary rows carry no messages).
 * @param {string[]} phones - raw lead phone numbers
 * @returns {Promise<Record<string, { sent: number, failed: number, replied: boolean }>>} keyed by "+1XXXXXXXXXX";
 *          a phone with no Vtext messages is missing from the result
 */
async function getVtextTextSummaryForPhones(phones = []) {
  const unique = [...new Set((phones || []).map(normalisePhone).filter(Boolean))];
  if (!unique.length) return {};
  try {
    const contacts = await VtextContact.find({ phoneE164: { $in: unique } }).select("_id phoneE164").lean();
    if (!contacts.length) return {};
    const phoneByContactId = new Map(contacts.map((c) => [String(c._id), c.phoneE164]));
    const rows = await VtextMessage.aggregate([
      { $match: { contactId: { $in: contacts.map((c) => c._id) } } },
      {
        $group: {
          _id: "$contactId",
          sent: { $sum: { $cond: [{ $and: [{ $eq: ["$direction", "out"] }, { $in: ["$status", TEXTED_STATUSES] }] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $and: [{ $eq: ["$direction", "out"] }, { $in: ["$status", NOT_SENT_STATUSES] }] }, 1, 0] } },
          replies: { $sum: { $cond: [{ $eq: ["$direction", "in"] }, 1, 0] } },
        },
      },
    ]);
    const byPhone = {};
    for (const r of rows) byPhone[phoneByContactId.get(String(r._id))] = { sent: r.sent, failed: r.failed, replied: r.replies > 0 };
    return byPhone;
  } catch (err) {
    console.error("[vtext lead text summary] lookup failed:", err.message);
    return {}; // best effort, like the other lead-list lookups
  }
}

module.exports = { getVtextMessagesForPhones, getVtextTextSummaryForPhones };
