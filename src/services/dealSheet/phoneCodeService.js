// services/dealSheet/phoneCodeService.js
//
// The /deal form texts every buyer who gives a number ONE text: their deal sheet link and a 6-digit code.
//   "Vihara: your deal sheet for 960 Larrabee St: www.vihara.ai/s/<token>?v=<marker>. Code 482913 to open it on
//    the page. Reply STOP to opt out."
// Entering the code on the form confirms the number (method "code"); opening the texted link does too ("sms_link",
// the ?v= marker is only on the texted link, so opens from the email don't count).
//
// The text replaces the old /deal sign-up text (one text, not two). It goes to everyone who gives a number, consent
// box or not (it's the sheet they asked for), through the Twilio A2P SMS line only; opt-outs still block it.
// Limits: the code lasts 10 minutes and allows 5 tries; 3 sends per lead and 5 per number per day.
const crypto = require("crypto");
const PhoneCode = require("../../model/leads/phoneCodeModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { enqueueOutbound } = require("../vtext/vtextMessageService");
const { getSiteUrl } = require("../../config/siteUrls");
const { maskPhone } = require("../../utils/maskPii");
const {
  CODE_TTL_MS,
  CODE_MAX_ATTEMPTS,
  MAX_SENDS_PER_LEAD,
  MAX_SENDS_PER_NUMBER_PER_DAY,
} = require("../../config/dealSheet");

const hashCode = (leadId, code) =>
  crypto.createHash("sha256").update(`${leadId}:${code}:${process.env.JWT_SECRET || "deal-sheet"}`).digest("hex");

// "https://www.vihara.ai" → "www.vihara.ai": shorter, and phones still make it a link.
const shortSite = () => getSiteUrl().replace(/^https?:\/\//, "");

function textBody({ street, token, marker, code }) {
  const link = `${shortSite()}/s/${token}${marker ? `?v=${marker}` : ""}`;
  return `Vihara: your deal sheet for ${street}: ${link}. Code ${code} to open it on the page. Reply STOP to opt out.`;
}

/**
 * Text a new code (and the sheet link) to `phone` for this lead.
 * @param {object} lead       PropertyLead (needs _id, fullName, dealSheet.token/marker)
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

  // The texted link confirms the number when opened, so it carries the marker only when it points at this
  // number's own lead (not after "Change number" to a number another lead has).
  const body = textBody({
    street: street || "your home",
    token: lead.dealSheet.token,
    marker: existingLeadId ? "" : lead.dealSheet.marker,
    code,
  });

  try {
    const { blocked, reason, message } = await enqueueOutbound({
      to: phone,
      body,
      origin: { kind: "automation", templateKey: "deal-sheet-code", ...(propertyId ? { propertyId } : {}) },
      // Twilio A2P SMS only: never the iMessage lines (no links to strangers there), and it reaches every US mobile.
      channelPolicy: { mode: "only", channels: ["twilio-sms"] },
      contactName: lead.fullName,
      isReplyToInbound: false,
    });
    if (blocked) {
      console.error(`[deal-sheet text] BLOCKED for lead ${lead._id} (${maskPhone(phone)}): ${reason}`);
      return { ok: false, reason: "blocked" };
    }
    console.log(`[deal-sheet text] queued for lead ${lead._id} (${maskPhone(phone)}), message ${message?._id}`);
    return { ok: true };
  } catch (err) {
    console.error(`[deal-sheet text] FAILED for lead ${lead._id}:`, err.message);
    return { ok: false, reason: "error" };
  }
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

module.exports = { sendCode, verifyCode, markVerified, textBody };
