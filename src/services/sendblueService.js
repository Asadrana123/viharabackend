// services/sendblueService.js
//
// Sendblue inbound texting + Maya auto-reply → admin leads tabs.
//
//   WRITE : saveInboundMessage    — one "receive" webhook payload → one doc (idempotent).
//   REPLY : autoReplyToFirstInbound — greet a lead the FIRST time they text (keyword-based).
//   SEND  : sendMessage           — POST an outbound text to Sendblue + persist it.
//   READ  : getMessagesForPhones  — texts grouped by phone for the admin leads tabs.

const axios = require("axios");
const SendblueMessage = require("../model/sendblueMessageModel");
const { normalisePhone } = require("./vapiCallsService");

// Outbound send credentials + line. Graceful-degrade like brevoService: if unset,
// sending is skipped (with a warning) rather than throwing.
const SENDBLUE_SEND_URL = "https://api.sendblue.co/api/send-message";
const SENDBLUE_API_KEY_ID = process.env.SENDBLUE_API_KEY_ID || "";
const SENDBLUE_API_SECRET_KEY = process.env.SENDBLUE_API_SECRET_KEY || "";
const SENDBLUE_FROM_NUMBER = process.env.SENDBLUE_FROM_NUMBER || ""; // fallback line

/* ─────────────────────────── WRITE SIDE ─────────────────────────── */

// Sendblue "receive" payload → our doc shape. `number` is the end-user (lead) for
// BOTH directions, so it is the join key; is_outbound sets direction. messageHandle
// is only set when present so the sparse-unique index isn't tripped by blanks.
const mapInbound = (p = {}) => {
  const contact = p.number || p.from_number || "";
  const doc = {
    direction: p.is_outbound ? "outbound" : "inbound",
    phone: contact,
    phoneNormalized: normalisePhone(contact) || "",
    content: p.content || "",
    mediaUrl: p.media_url || "",
    service: p.service || "",
    status: p.status || "",
    fromNumber: p.from_number || "",
    toNumber: p.to_number || "",
    sendblueNumber: p.sendblue_number || "",
    optedOut: p.opted_out === true,
    sentAt: p.date_sent ? new Date(p.date_sent) : new Date(),
    raw: p,
  };
  if (p.message_handle) doc.messageHandle = p.message_handle;
  return doc;
};

/**
 * Persist one Sendblue "receive" webhook delivery. Idempotent: a retried webhook
 * with the same message_handle updates the existing row instead of inserting a
 * duplicate. Returns { saved, isNew }: isNew is true only on a genuinely first
 * insert, which the webhook controller uses to fire the auto-reply exactly once.
 * Skips (saved:false) when the payload has no usable phone. Throws only on a real
 * DB error so the controller can 500 and let Sendblue retry.
 */
const saveInboundMessage = async (payload) => {
  const doc = mapInbound(payload);
  if (!doc.phoneNormalized) return { saved: false, skipped: true, isNew: false };

  if (doc.messageHandle) {
    const r = await SendblueMessage.updateOne(
      { messageHandle: doc.messageHandle },
      { $set: doc },
      { upsert: true }
    );
    return { saved: true, isNew: !!(r.upsertedCount || r.upsertedId) };
  }

  await SendblueMessage.create(doc);
  return { saved: true, isNew: true };
};

/* ─────────────────────────── AUTO-REPLY ─────────────────────────── */

// Keyword → greeting. Evaluated top to bottom; FIRST match wins, so the
// property-specific openers take priority over the generic ones. All matching is
// case-insensitive. Edit the copy here.
//
// NOTE: the auction reply hardcodes "the 29th" — update it if the auction date
// changes (kept verbatim as provided).
const AUTO_REPLIES = [
  {
    match: ["big bear"],
    text:
      "Hey! this is Maya. great, you're asking about Big Bear Lake — happy to answer anything on the numbers, the auction, or how bidding works. what's on your mind?",
  },
  {
    match: ["ogdensburg"],
    text:
      "Hey! this is Maya. great, you're asking about Ogdensburg — happy to answer anything on the numbers, the auction, or how bidding works. what's on your mind?",
  },
  {
    match: ["auction", "email"],
    text: "Hey! this is Maya. thanks for following up — what can I help clarify before the 29th?",
  },
  {
    match: ["our call"],
    text:
      "Hey! good to hear from you. still thinking through registering, or is there something specific I can help with?",
  },
  {
    match: ["partner"],
    text: "Hey! this is Maya on the partner side. what market or buyer are you working with?",
  },
];

const DEFAULT_REPLY = "Hey! this is Maya from vihara. happy to help — what can I help with?";

// Pure — pick the reply text for a message body.
const pickAutoReply = (content) => {
  const text = String(content || "").toLowerCase();
  for (const rule of AUTO_REPLIES) {
    if (rule.match.some((kw) => text.includes(kw))) return rule.text;
  }
  return DEFAULT_REPLY;
};

/**
 * Greet a lead the FIRST time they text. Guard is `inbound count === 1` for this
 * phone, so Maya never re-greets mid-conversation. Best-effort — never throws.
 *
 * @param {object} args
 * @param {string} args.contact         the lead's number (payload.number)
 * @param {string} args.content         the inbound text body (for keyword pick)
 * @param {string} [args.sendblueNumber] the line they texted (reply is sent from it)
 */
const autoReplyToFirstInbound = async ({ contact, content, sendblueNumber }) => {
  const phoneNormalized = normalisePhone(contact) || "";
  if (!phoneNormalized) return { skipped: true };

  try {
    const inboundCount = await SendblueMessage.countDocuments({
      phoneNormalized,
      direction: "inbound",
    });
    if (inboundCount !== 1) return { skipped: true }; // only greet on the first text

    return await sendMessage({
      to: contact,
      content: pickAutoReply(content),
      from: sendblueNumber,
    });
  } catch (e) {
    console.error("[sendblue-autoreply] failed:", e.message);
    return { success: false, error: true };
  }
};

/* ─────────────────────────── SEND SIDE ─────────────────────────── */

// Sendblue outbound send response → outbound doc.
const mapOutbound = (data = {}, { to, from, content }) => {
  const doc = {
    direction: "outbound",
    phone: to,
    phoneNormalized: normalisePhone(to) || "",
    content: data.content || content || "",
    mediaUrl: data.media_url || "",
    service: data.service || "",
    status: data.status || "",
    fromNumber: from,
    toNumber: to,
    sendblueNumber: from,
    optedOut: data.opted_out === true,
    sentAt: data.date_sent ? new Date(data.date_sent) : new Date(),
    raw: data,
  };
  if (data.message_handle) doc.messageHandle = data.message_handle;
  return doc;
};

/**
 * Send one outbound text via Sendblue and persist it so it shows in the leads
 * tab conversation. Replies from the line the contact messaged (`from`), falling
 * back to SENDBLUE_FROM_NUMBER. Non-throwing — returns a result object; a send
 * failure is logged, not raised (it must never break the webhook).
 */
const sendMessage = async ({ to, content, from }) => {
  const fromNumber = from || SENDBLUE_FROM_NUMBER;

  if (!SENDBLUE_API_KEY_ID || !SENDBLUE_API_SECRET_KEY || !fromNumber) {
    console.warn("⚠️  Sendblue send not configured — skipping outbound reply.");
    return { success: false, skipped: true };
  }
  if (!to || !content) return { success: false, skipped: true };

  let data = {};
  try {
    const resp = await axios.post(
      SENDBLUE_SEND_URL,
      { number: to, from_number: fromNumber, content },
      {
        headers: {
          "sb-api-key-id": SENDBLUE_API_KEY_ID,
          "sb-api-secret-key": SENDBLUE_API_SECRET_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
    data = resp.data || {};
  } catch (err) {
    console.error("[sendblue-send] failed:", err.response?.data || err.message);
    return { success: false, error: true };
  }

  try {
    await SendblueMessage.create(mapOutbound(data, { to, from: fromNumber, content }));
  } catch (e) {
    console.error("[sendblue-send] outbound save failed:", e.message);
  }

  return { success: true, data };
};

/* ─────────────────────────── READ SIDE ─────────────────────────── */

/**
 * Given a list of lead phone numbers, return their texts grouped by normalised
 * phone, oldest → newest (natural conversation order). Same best-effort contract
 * as getCallsForPhones — on any DB error it returns {} so the admin leads list
 * still renders (each lead just gets an empty `messages` array).
 */
const getMessagesForPhones = async (phones = []) => {
  const keys = [
    ...new Set((phones || []).map((p) => normalisePhone(p)).filter(Boolean)),
  ];
  if (!keys.length) return {};

  let messages = [];
  try {
    messages = await SendblueMessage.find({ phoneNormalized: { $in: keys } })
      .select("direction content service status sentAt mediaUrl optedOut phoneNormalized")
      .sort({ sentAt: 1 })
      .lean();
  } catch (err) {
    console.error("[sendblue-messages] lookup failed:", err.message);
    return {};
  }

  const byPhone = {};
  for (const m of messages) {
    (byPhone[m.phoneNormalized] = byPhone[m.phoneNormalized] || []).push(m);
  }
  return byPhone;
};

module.exports = {
  saveInboundMessage,
  autoReplyToFirstInbound,
  sendMessage,
  pickAutoReply,
  getMessagesForPhones,
};
