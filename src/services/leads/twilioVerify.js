// services/leads/twilioVerify.js
//
// Text codes to website visitors through Twilio Verify (home pop-up phone check).
// Twilio makes the code, texts it from its own numbers, keeps it for 10 minutes and
// checks it, so nothing here stores a code. No 10DLC campaign is involved.
//
// Env:
//   TWILIO_VERIFY_SERVICE_SID   "VA…", the Verify Service (Console → Verify → Services)
// Keys, first match wins:
//   1. the stored keys on the Vtext Twilio SMS line (Admin → Vtext → Lines), same account as the Verify Service
//   2. TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET  (or + TWILIO_AUTH_TOKEN), for a
//      local DB with no Twilio line. Line first, so an old TWILIO_* value in an .env can't override it.
const VtextLine = require("../../model/vtext/vtextLineModel");
const { decryptCredentials } = require("../../utils/secretBox");

let clientFactory = null;
/** Tests only: `fn()` returns { createVerification, createCheck }. Pass null to restore the real client. */
function setVerifyClientForTests(fn) {
  clientFactory = fn;
}

const SERVICE_SID = () => String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

async function loadCredentials() {
  const line = await VtextLine.findOne({ channelType: "twilio-sms", status: { $ne: "retired" } })
    .select("+credentials.iv +credentials.tag +credentials.ciphertext")
    .sort({ status: 1, createdAt: 1 })
    .lean();
  if (line?.credentials?.ciphertext) return decryptCredentials(line.credentials);

  const env = process.env;
  if (env.TWILIO_ACCOUNT_SID && ((env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET) || env.TWILIO_AUTH_TOKEN)) {
    return {
      accountSid: env.TWILIO_ACCOUNT_SID,
      apiKeySid: env.TWILIO_API_KEY_SID,
      apiKeySecret: env.TWILIO_API_KEY_SECRET,
      authToken: env.TWILIO_AUTH_TOKEN,
    };
  }
  return null;
}

let cached = null; // { client, at }
const CACHE_MS = 10 * 60 * 1000;

async function getClient() {
  if (clientFactory) return clientFactory();
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.client;

  const creds = await loadCredentials();
  if (!creds) throw Object.assign(new Error("No Twilio keys for Verify"), { verifyReason: "not_configured" });

  const twilio = require("twilio");
  const raw =
    creds.apiKeySid && creds.apiKeySecret
      ? twilio(creds.apiKeySid, creds.apiKeySecret, { accountSid: creds.accountSid })
      : twilio(creds.accountSid, creds.authToken);
  const service = () => raw.verify.v2.services(SERVICE_SID());
  const client = {
    createVerification: (params) => service().verifications.create(params),
    createCheck: (params) => service().verificationChecks.create(params),
  };
  cached = { client, at: Date.now() };
  return client;
}

// Twilio error codes → our reasons. https://www.twilio.com/docs/api/errors
const REASONS = {
  60200: "invalid", // bad phone number
  21211: "invalid",
  21614: "invalid", // not a mobile number
  60205: "invalid", // SMS not supported (landline)
  60203: "limit", // too many sends to this number
  60202: "attempts", // too many wrong codes
  60410: "blocked", // Fraud Guard
  60605: "country", // Verify geo permissions
  60220: "country",
  21408: "country",
  20404: "expired", // no pending code (expired, used, or never sent)
  20429: "limit",
};

function reasonFor(err) {
  if (err?.verifyReason) return err.verifyReason;
  return REASONS[err?.code] || "error";
}

/**
 * Text a code to `to` (E.164).
 * @returns {Promise<{ok:true} | {ok:false, reason:string}>}
 */
async function sendVerification(to) {
  if (!SERVICE_SID()) return { ok: false, reason: "not_configured" };
  try {
    const client = await getClient();
    await client.createVerification({ to, channel: "sms" });
    return { ok: true };
  } catch (err) {
    const reason = reasonFor(err);
    console.error(`[verify] send failed (${reason}, code ${err?.code || "-"}):`, err?.message);
    return { ok: false, reason };
  }
}

/**
 * Check the code the visitor typed.
 * @returns {Promise<{ok:true} | {ok:false, reason:string}>}  reason "mismatch" when the code is wrong
 */
async function checkVerification(to, code) {
  const clean = String(code || "").replace(/\D/g, "");
  if (!/^\d{4,10}$/.test(clean)) return { ok: false, reason: "mismatch" };
  if (!SERVICE_SID()) return { ok: false, reason: "not_configured" };
  try {
    const client = await getClient();
    const check = await client.createCheck({ to, code: clean });
    return check?.status === "approved" ? { ok: true } : { ok: false, reason: "mismatch" };
  } catch (err) {
    const reason = reasonFor(err);
    console.error(`[verify] check failed (${reason}, code ${err?.code || "-"}):`, err?.message);
    return { ok: false, reason };
  }
}

module.exports = { sendVerification, checkVerification, setVerifyClientForTests };
