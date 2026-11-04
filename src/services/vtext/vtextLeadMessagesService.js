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
const VtextLine = require("../../model/vtext/vtextLineModel");
const { normalisePhone } = require("../calling/vapiCallsService");

const CHANNEL_LABEL = {
  "imessage-bluebubbles": "iMessage",
  "android-sms": "SMS",
  "twilio-sms": "SMS",
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
    // The Leads tab's iMessage line: this number isn't on iMessage (see isNotOnImessage below).
    ...(isOut && channelOf(m.channelType) === "imessage" && isNotOnImessage({ status: m.status, errorKind: m.error?.kind, errorCode: m.error?.code })
      ? { notOnImessage: true }
      : {}),
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

// "Not on iMessage": an iMessage text that failed because of the recipient (Messages' error 22, "likely not an
// iMessage user", or a rejected chat), or one BlueBubbles accepted but never confirmed (the unconfirmed-send
// sweep's "no-receipt", usually a number that isn't on iMessage). See imessageBluebubbles/adapter.js and
// workers/maintenanceWorker.js.
const NO_RECEIPT_CODE = "no-receipt";
const isNotOnImessage = ({ status, errorKind, errorCode }) =>
  (status === "failed" && errorKind === "recipient") || (status === "unknown" && errorCode === NO_RECEIPT_CODE);

// Which channel a message counts under. Android and Twilio texts carry "android-sms" / "twilio-sms" (set when a line takes them).
// Everything else is iMessage: every live line is iMessage today, and a text that was blocked or is still
// queued has no channel yet.
const channelOf = (channelType) => (channelType === "android-sms" || channelType === "twilio-sms" ? "sms" : "imessage");

const emptyChannel = () => ({ sent: 0, failed: 0, replied: false });

/**
 * Text state for one contact from its grouped message rows. Pure.
 * @param {object[]} rows - [{ direction, status, channelType, errorKind, errorCode, resent, n }]
 * @param {boolean} smsInUse - true once an Android or Twilio SMS line exists; only then is `sms` included
 * @returns {{ sent, failed, replied, imessage: { sent, failed, replied, notOnImessage }, sms?: { sent, failed, replied } }}
 *          `sent` / `failed` / `replied` at the top are both channels together (as before)
 */
function summarizeTexts(rows = [], smsInUse = false) {
  const out = { ...emptyChannel(), imessage: { ...emptyChannel(), notOnImessage: 0 }, ...(smsInUse ? { sms: emptyChannel() } : {}) };
  for (const r of rows) {
    const ch = out[channelOf(r.channelType)] || null; // an SMS row while no SMS line exists only counts in the totals
    const n = r.n || 0;
    if (r.direction === "in") {
      out.replied = true;
      if (ch) ch.replied = true;
      continue;
    }
    if (TEXTED_STATUSES.includes(r.status)) {
      out.sent += n;
      if (ch) ch.sent += n;
    } else if (NOT_SENT_STATUSES.includes(r.status)) {
      // An iMessage that did not go but was re-sent by SMS is not a lead we failed to reach: its SMS counts on its own.
      if (!r.resent) {
        out.failed += n;
        if (ch) ch.failed += n;
      }
      if (ch === out.imessage && isNotOnImessage(r)) ch.notOnImessage += n;
    }
  }
  return out;
}

/**
 * Light text state per lead phone, for the Leads tab's text lines and filters (the summary rows carry no
 * messages), split by channel: iMessage, and Android SMS once an Android line exists.
 * @param {string[]} phones - raw lead phone numbers
 * @returns {Promise<Record<string, ReturnType<typeof summarizeTexts>>>} keyed by "+1XXXXXXXXXX", one entry per
 *          phone (all zeros when the number has no Vtext messages)
 */
async function getVtextTextSummaryForPhones(phones = []) {
  const unique = [...new Set((phones || []).map(normalisePhone).filter(Boolean))];
  if (!unique.length) return {};
  try {
    const [contacts, smsLine] = await Promise.all([
      VtextContact.find({ phoneE164: { $in: unique } }).select("_id phoneE164").lean(),
      VtextLine.exists({ channelType: { $in: ["android-sms", "twilio-sms"] }, status: { $ne: "retired" } }),
    ]);
    const smsInUse = !!smsLine;
    const rowsByContact = new Map();
    if (contacts.length) {
      const rows = await VtextMessage.aggregate([
        { $match: { contactId: { $in: contacts.map((c) => c._id) } } },
        {
          $group: {
            _id: { contactId: "$contactId", direction: "$direction", status: "$status", channelType: "$channelType", errorKind: "$error.kind", errorCode: "$error.code", resent: { $ne: [{ $ifNull: ["$fallback.messageId", null] }, null] } },
            n: { $sum: 1 },
          },
        },
      ]);
      for (const { _id, n } of rows) {
        const key = String(_id.contactId);
        if (!rowsByContact.has(key)) rowsByContact.set(key, []);
        rowsByContact.get(key).push({ ..._id, n });
      }
    }
    const contactIdByPhone = new Map(contacts.map((c) => [c.phoneE164, String(c._id)]));
    const byPhone = {};
    for (const phone of unique) byPhone[phone] = summarizeTexts(rowsByContact.get(contactIdByPhone.get(phone)), smsInUse);
    return byPhone;
  } catch (err) {
    console.error("[vtext lead text summary] lookup failed:", err.message);
    return {}; // best effort, like the other lead-list lookups
  }
}

module.exports = { getVtextMessagesForPhones, getVtextTextSummaryForPhones, summarizeTexts };
