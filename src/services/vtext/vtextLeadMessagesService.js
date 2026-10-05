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
    direction: isOut ? "outbound" : "inbound",
    content: m.body || "",
    sentAt: isOut ? m.sentAt || m.createdAt : m.receivedAt || m.createdAt,
    service: CHANNEL_LABEL[m.channelType] || m.channelType || "text",
    // Delivery info is only meaningful for our own texts. readAt is set only
    // when the recipient has read receipts on, so a missing readAt is not "unread".
    ...(isOut ? { status: m.status, deliveredAt: m.deliveredAt || null, readAt: m.readAt || null } : {}),
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
      .select("contactId direction body channelType status sentAt deliveredAt readAt receivedAt createdAt")
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

module.exports = { getVtextMessagesForPhones };
