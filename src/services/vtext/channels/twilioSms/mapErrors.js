// services/vtext/channels/twilioSms/mapErrors.js
//
// Maps Twilio REST errors (RestException: .status = HTTP status, .code = Twilio
// error code) and Twilio status-callback ErrorCodes to ChannelError kinds.
//
// Twilio has no idempotency key on messages.create. So a failure AFTER the
// request may have reached Twilio (a timeout, a connection reset, a 5xx) is
// UNCERTAIN: the text may or may not have been queued, and retrying could text
// the person twice. UNCERTAIN is a "recipient" error (never retried, shows up
// as a ⚠️ Slack alert, vtextTextProblemAlert.js) on purpose. Only errors that prove the request
// never left (DNS, connection refused) are retried as "transient".
const { ChannelError } = require("../channelError");

// Twilio error codes by what is wrong. https://www.twilio.com/docs/api/errors
const CONFIG_CODES = new Set([20003, 21606, 21659, 21712, 30034]); // bad credentials, sender not valid for the account/service, number not registered to a campaign
const RECIPIENT_CODES = new Set([21211, 21214, 21408, 21612, 21614]); // invalid / unreachable / not-a-mobile / region not enabled
const OPTED_OUT_CODE = 21610; // recipient replied STOP to this sender; Twilio blocks every send until START
const RATE_LIMIT_CODES = new Set([20429]);

const NEVER_SENT_NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

const DEFAULT_RETRY_AFTER_MS = 30 * 1000;

function mapSendError(err) {
  if (err instanceof ChannelError) return err;

  const http = err.status;
  const code = typeof err.code === "number" ? err.code : Number(err.code) || null;
  const detail = err.message || "Twilio request failed";

  if (code === OPTED_OUT_CODE) {
    return new ChannelError("recipient", "OPTED_OUT", `Twilio: recipient has opted out of this sender (21610): ${detail}`);
  }
  if (code && CONFIG_CODES.has(code)) {
    return new ChannelError("config", `TWILIO_${code}`, `Twilio setup problem (${code}): ${detail}`);
  }
  if (http === 401 || http === 403) {
    return new ChannelError("config", "AUTH_FAILED", `Twilio auth failed (${http}): ${detail}`);
  }
  if (code && RECIPIENT_CODES.has(code)) {
    return new ChannelError("recipient", `TWILIO_${code}`, `Twilio rejected the recipient (${code}): ${detail}`);
  }
  if (http === 429 || (code && RATE_LIMIT_CODES.has(code))) {
    return new ChannelError("transient", "RATE_LIMITED", `Twilio rate limit (${http || code}): ${detail}`, { retryAfterMs: DEFAULT_RETRY_AFTER_MS });
  }

  // No HTTP status and no Twilio code: the request failed at the network level.
  if (!http && !code) {
    if (NEVER_SENT_NETWORK_CODES.has(err.code)) {
      return new ChannelError("transient", "NETWORK_ERROR", `Twilio unreachable, nothing was sent: ${detail}`);
    }
    return new ChannelError("recipient", "UNCERTAIN", `Twilio request failed after it may have been sent (${err.code || "no code"}): ${detail}`);
  }

  if (http >= 500) {
    return new ChannelError("recipient", "UNCERTAIN", `Twilio server error (${http}), the text may or may not have been queued: ${detail}`);
  }

  return new ChannelError("line", code ? `TWILIO_${code}` : "UNKNOWN_ERROR", `Twilio error (${http || "no status"}${code ? `, code ${code}` : ""}): ${detail}`);
}

/**
 * Error kind for a delivery-receipt ErrorCode (status "undelivered" or "failed").
 * Handset/number problems belong to the recipient; carrier filtering and
 * everything else count against the line.
 */
function errorKindForStatusCode(errorCode) {
  const code = Number(errorCode);
  // 30003 handset unreachable, 30005 unknown destination, 30006 landline/unreachable carrier, 21610 opted out
  if ([30003, 30005, 30006, OPTED_OUT_CODE].includes(code)) return "recipient";
  // 30007 carrier filtered the message (content or campaign issue): that is a line-level signal
  return "line";
}

module.exports = { mapSendError, errorKindForStatusCode, OPTED_OUT_CODE };
