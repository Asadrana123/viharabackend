// services/vtext/channels/channelError.js
//
// The one error shape every channel adapter throws from send(). The worker
// that calls send() (lineSendWorker, Phase 2) branches on `kind` to decide
// what happens next — see sendify-infra.md §4.3 step 4a-4d:
//   "recipient" -> permanently failed, never retry (bad number/contact)
//   "line"      -> this line is bad, reroute to another + count toward quarantine
//   "transient" -> retry with backoff (network blip, provider 5xx)
//   "config"    -> this line's credentials/setup are wrong, pause + alert
class ChannelError extends Error {
  /**
   * @param {"recipient"|"line"|"transient"|"config"} kind
   * @param {string} code - adapter-specific short code, e.g. "AUTH_FAILED", "INVALID_RECIPIENT"
   * @param {string} message
   * @param {object} [opts]
   * @param {number} [opts.retryAfterMs]
   */
  constructor(kind, code, message, opts = {}) {
    super(message);
    this.name = "ChannelError";
    this.kind = kind;
    this.code = code;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

const KINDS = ["recipient", "line", "transient", "config"];

module.exports = { ChannelError, KINDS };
