// services/twilio/twilioKeys.js
//
// The Twilio keys our account-level Twilio calls use (Verify codes, Lookup). First match wins:
//   1. the stored keys on the Vtext Twilio SMS line (Admin → Vtext → Lines)
//   2. TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET  (or + TWILIO_AUTH_TOKEN), for a
//      local DB with no Twilio line. Line first, so an old TWILIO_* value in an .env can't override it.
const VtextLine = require("../../model/vtext/vtextLineModel");
const { decryptCredentials } = require("../../utils/secretBox");

/** @returns {Promise<{accountSid:string, apiKeySid?:string, apiKeySecret?:string, authToken?:string} | null>} */
async function loadTwilioCredentials() {
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

/** A Twilio REST client from those keys. */
function twilioClientFrom(creds) {
  const twilio = require("twilio");
  return creds.apiKeySid && creds.apiKeySecret
    ? twilio(creds.apiKeySid, creds.apiKeySecret, { accountSid: creds.accountSid })
    : twilio(creds.accountSid, creds.authToken);
}

module.exports = { loadTwilioCredentials, twilioClientFrom };
