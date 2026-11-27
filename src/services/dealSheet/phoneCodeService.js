// services/dealSheet/phoneCodeService.js
//
// The /deal form's one sign-up text (deal form v3, Prajwal 27 Nov 2026). It carries NO link:
//   Maya box not ticked: "Vihara: your deal sheet for 960 Larrabee St is in your email. Reply STOP to opt out."
//   Maya box ticked:     "Vihara: your deal sheet for 960 Larrabee St is in your email. Your code is 482913, so Maya
//                         can call you. Reply STOP to opt out."
// Entering the code on the form confirms the number (method "code"). Opening a link no longer does (sms_link dropped).
//
// It replaces the old /deal sign-up text (one text, not two), goes to everyone who gives a number, through the
// Twilio A2P SMS line only; opt-outs still block it.
// Code limits: it lasts 10 minutes and allows 5 tries; 3 sends per lead and 5 per number per day.
const crypto = require("crypto");
const PhoneCode = require("../../model/leads/phoneCodeModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { enqueueOutbound } = require("../vtext/vtextMessageService");
const { maskPhone } = require("../../utils/maskPii");
const {
  CODE_TTL_MS,
  CODE_MAX_ATTEMPTS,
  MAX_SENDS_PER_LEAD,
  MAX_SENDS_PER_NUMBER_PER_DAY,
} = require("../../config/dealSheet");

const hashCode = (leadId, code) =>
  crypto.createHash("sha256").update(`${leadId}:${code}:${process.env.JWT_SECRET || "deal-sheet"}`).digest("hex");

function textBody({ street, code }) {
  const base = `Vihara: your deal sheet for ${street} is in your email.`;
  return code ? `${base} Your code is ${code}, so Maya can call you. Reply STOP to opt out.` : `${base} Reply STOP to opt out.`;
}

async function sendText(lead, { phone, body, templateKey, propertyId }) {
  try {
    const { blocked, reason, message } = await enqueueOutbound({
      to: phone,
      body,
      origin: { kind: "automation", templateKey, ...(propertyId ? { propertyId } : {}) },
      // Twilio A2P SMS only: never the iMessage lines, and it reaches every US mobile.
      channelPolicy: { mode: "only", channels: ["twilio-sms"] },
      contactName: lead.fullName,
      isReplyToInbound: false,
    });
    if (blocked) {
      console.error(`[deal-sheet text] BLOCKED for lead ${lead._id} (${maskPhone(phone)}): ${reason}`);
      return { ok: false, reason: "blocked" };
    }
    console.log(`[deal-sheet text] ${templateKey} queued for lead ${lead._id} (${maskPhone(phone)}), message ${message?._id}`);
    return { ok: true };
  } catch (err) {
    console.error(`[deal-sheet text] FAILED for lead ${lead._id}:`, err.message);
    return { ok: false, reason: "error" };
  }
}

/** The text without a code (Maya box not ticked): the deal sheet is in their email. */
async function sendSheetNotice(lead, { phone, street, propertyId }) {
  return sendText(lead, { phone, body: textBody({ street: street || "your home" }), templateKey: "deal-sheet-notice", propertyId });
}

/**
 * Text a new code to `phone` for this lead (Maya box ticked).
 * @param {object} lead       PropertyLead (needs _id, fullName)
 * @param {object} o
 * @param {string} o.phone    E.164
 * @param {string} o.street   the deal's street, for the text
 * @param {string} [o.existingLeadId]  the number already has a lead for this deal: the code confirms that one
 * @param {*} [o.propertyId]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function sendCode(lead, { phone, street, existingLeadId = null, propertyId }) {
  const leadSends = await PhoneCode.countDocuments({ leadId: lead._id });
  if (leadSends >= MAX_SENDS_PER_LEAD) return { ok: false, reason: "limit" };
  const numberSends = await PhoneCode.countDocuments({ phone, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  if (numberSends >= MAX_SENDS_PER_NUMBER_PER_DAY) return { ok: false, reason: "limit" };

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await PhoneCode.create({
    leadId: lead._id,
    phone,
    existingLeadId,
    codeHash: hashCode(lead._id, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return sendText(lead, { phone, body: textBody({ street: street || "your home", code }), templateKey: "deal-sheet-code", propertyId });
}

/**
 * Check a code. On success the number is confirmed (the caller fires the follow-ups).
 * @returns {Promise<{ ok: boolean, reason?: "expired"|"attempts"|"mismatch", verifiedLeadId?: string, existingLeadId?: string }>}
 */
async function verifyCode(lead, code) {
  const row = await PhoneCode.findOne({ leadId: lead._id, verifiedAt: null }).sort({ createdAt: -1 });
  if (!row || row.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: "attempts" };
  const given = String(code || "").replace(/\D/g, "");
  if (given.length !== 6 || hashCode(lead._id, given) !== row.codeHash) {
    await PhoneCode.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
    return { ok: false, reason: row.attempts + 1 >= CODE_MAX_ATTEMPTS ? "attempts" : "mismatch" };
  }
  await PhoneCode.updateOne({ _id: row._id }, { $set: { verifiedAt: new Date() } });
  return { ok: true, verifiedLeadId: String(row.existingLeadId || lead._id), existingLeadId: row.existingLeadId ? String(row.existingLeadId) : null };
}

/**
 * Mark a lead's number confirmed. Returns true when this call confirmed it (false if it already was).
 * @param {string} leadId
 * @param {"code"|"sms_link"} method
 */
async function markVerified(leadId, method) {
  const res = await PropertyLead.updateOne(
    { _id: leadId, phoneVerifiedAt: null },
    { $set: { phoneVerifiedAt: new Date(), phoneVerifyMethod: method } }
  );
  return res.modifiedCount === 1;
}

module.exports = { sendCode, sendSheetNotice, verifyCode, markVerified, textBody };
