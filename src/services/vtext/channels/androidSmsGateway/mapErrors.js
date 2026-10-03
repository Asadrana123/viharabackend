// services/vtext/channels/androidSmsGateway/mapErrors.js
//
// Maps axios/android-sms-gateway errors to ChannelError kinds. The gateway's
// error body is documented (`smsgateway.ErrorResponse`: { code, message,
// data }), unlike BlueBubbles' at the time its own mapErrors.js was written —
// still starting from HTTP status primarily, since the gateway's own `code`
// values aren't enumerated anywhere in its OpenAPI spec.
const { ChannelError } = require("../channelError");

function mapSendError(err) {
  if (err instanceof ChannelError) return err;

  // Network-level failure: tunnel down, phone off/unreachable, DNS, etc.
  if (!err.response) {
    return new ChannelError("transient", "NETWORK_ERROR", err.message || "android-sms-gateway request failed with no response");
  }

  const status = err.response.status;
  const body = err.response.data;
  const serverMessage = (body && body.message) || err.message;

  if (status === 401 || status === 403) {
    return new ChannelError("config", "AUTH_FAILED", `android-sms-gateway auth failed (${status}): ${serverMessage}`);
  }
  if (status === 400) {
    return new ChannelError("recipient", "INVALID_RECIPIENT", `android-sms-gateway rejected the request (${status}): ${serverMessage}`);
  }
  if (status === 409) {
    // Our own id collided — see client.js's comment on why we never reuse
    // clientMessageId as the gateway's `id`. If this ever fires, it's a bug
    // in that id-generation, not a line or recipient problem.
    return new ChannelError("transient", "DUPLICATE_ID", `android-sms-gateway: duplicate message id (${status}): ${serverMessage}`);
  }
  if (status === 503) {
    // The gateway's own "queue limits exceeded; ensure device is online" —
    // a line-level problem (the phone is offline or overloaded), not this
    // one recipient's fault.
    return new ChannelError("line", "DEVICE_UNAVAILABLE", `android-sms-gateway device unavailable (${status}): ${serverMessage}`);
  }
  if (status >= 500) {
    return new ChannelError("transient", "SERVER_ERROR", `android-sms-gateway server error (${status}): ${serverMessage}`);
  }

  return new ChannelError("transient", "UNKNOWN_ERROR", `android-sms-gateway error (${status}): ${serverMessage}`);
}

module.exports = { mapSendError };
