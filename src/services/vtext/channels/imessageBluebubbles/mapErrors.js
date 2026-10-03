// services/vtext/channels/imessageBluebubbles/mapErrors.js
//
// Maps axios/BlueBubbles errors to ChannelError kinds. BlueBubbles' own error
// response shapes aren't fully documented publicly (checked during Phase 1 —
// see client.js's header comment) — this starts from safe, conservative
// defaults based on HTTP status alone, and should get tightened up with real
// error payloads once we're hitting a live server.
const { ChannelError } = require("../channelError");

function mapSendError(err) {
  if (err instanceof ChannelError) return err;

  // Network-level failure: tunnel down, Mac asleep/offline, DNS, etc.
  if (!err.response) {
    return new ChannelError("transient", "NETWORK_ERROR", err.message || "BlueBubbles request failed with no response");
  }

  const status = err.response.status;
  const body = err.response.data;
  const serverMessage = (body && (body.message || body.error)) || err.message;

  if (status === 401 || status === 403) {
    return new ChannelError("config", "AUTH_FAILED", `BlueBubbles auth failed (${status}): ${serverMessage}`);
  }
  if (status === 400 || status === 404) {
    // Most likely an invalid/unresolvable chatGuid — treat as recipient-level
    // until real testing shows this also fires for other bad-request cases.
    return new ChannelError("recipient", "INVALID_RECIPIENT", `BlueBubbles rejected the recipient/chat (${status}): ${serverMessage}`);
  }
  if (status >= 500) {
    return new ChannelError("transient", "SERVER_ERROR", `BlueBubbles server error (${status}): ${serverMessage}`);
  }

  // Unknown status — don't guess "recipient" (which stops retries permanently);
  // treat as transient so it at least gets retried a few times.
  return new ChannelError("transient", "UNKNOWN_ERROR", `BlueBubbles error (${status}): ${serverMessage}`);
}

module.exports = { mapSendError };
