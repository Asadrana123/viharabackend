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

  // No HTTP response at all — distinguish the specific failure instead of one
  // generic "network error" message, since each of these points the operator
  // at a different fix.
  if (!err.response) {
    if (err.code === "ECONNABORTED") {
      return new ChannelError(
        "transient",
        "TIMEOUT",
        "BlueBubbles didn't respond in time. The message may have actually sent anyway — check Messages.app or the line's Inbox before retrying. " +
          "If this keeps happening, check that the Mac is awake, BlueBubbles Server is running, and the ngrok tunnel is up."
      );
    }
    if (err.code === "ECONNREFUSED") {
      return new ChannelError(
        "transient",
        "CONNECTION_REFUSED",
        "Could not connect to BlueBubbles — the Mac is likely asleep, BlueBubbles Server isn't running, or the tunnel is down."
      );
    }
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      return new ChannelError(
        "config",
        "DNS_ERROR",
        "Could not resolve the BlueBubbles server URL — check the line's config.serverUrl is correct and the tunnel is actually running."
      );
    }
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
  // HTTP 500 "Message Send Error" is BlueBubbles reporting that Messages.app created
  // the message and it errored (seen live: "Can't get chat id" followed by
  // "Message sent with an error", then Code 22 on the receipt). This is what a
  // recipient who isn't on iMessage looks like on a line with no SMS fallback.
  // Retrying only creates more errored messages, so treat it as permanent.
  if (status === 500 && /message send error/i.test(String(serverMessage))) {
    return new ChannelError("recipient", "MESSAGE_SEND_ERROR", `BlueBubbles could not deliver the message (likely not an iMessage user): ${serverMessage}`);
  }
  if (status >= 500) {
    return new ChannelError("transient", "SERVER_ERROR", `BlueBubbles server error (${status}): ${serverMessage}`);
  }

  // Unknown status — don't guess "recipient" (which stops retries permanently);
  // treat as transient so it at least gets retried a few times.
  return new ChannelError("transient", "UNKNOWN_ERROR", `BlueBubbles error (${status}): ${serverMessage}`);
}

module.exports = { mapSendError };
