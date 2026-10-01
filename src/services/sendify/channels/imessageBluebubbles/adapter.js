// services/sendify/channels/imessageBluebubbles/adapter.js
//
// The real (non-mock) Phase-1 channel: iMessage via a self-hosted BlueBubbles
// server running on a Mac signed into a dedicated Apple ID. See
// sendify-infra.md §5.2/§5.3 for the full design and D13 for why BlueBubbles
// specifically. Capability/limit numbers are deliberately conservative —
// Apple publishes no official rate limits, so these are starting points to
// tune once the pilot line has real send history (sendify-infra.md §1, §7.6).
const { buildClient } = require("./client");
const { mapSendError } = require("./mapErrors");
const { decryptCredentials } = require("../../../../utils/secretBox");
const crypto = require("crypto");

/**
 * chatGuid for a brand-new/unknown contact — "any;-;+<phone>" or "any;-;<email>".
 * `to` is expected pre-formatted by the caller: E.164 (leading +) for a
 * phone number, or a plain email for an Apple ID — BlueBubbles' own chatGuid
 * format wraps whichever one unchanged.
 */
function chatGuidFor(to) {
  return `any;-;${to}`;
}

function credentialsFor(line) {
  // sendifyLineModel.credentials fields are `select:false` — callers must
  // .select("+credentials.iv +credentials.tag +credentials.ciphertext") when
  // loading the line doc for a send, or this will be undefined.
  if (!line.credentials || !line.credentials.ciphertext) {
    throw new Error(`Line ${line._id} has no stored credentials — was it loaded with +credentials selected?`);
  }
  return decryptCredentials(line.credentials);
}

module.exports = {
  type: "imessage-bluebubbles",
  displayName: "iMessage (BlueBubbles)",
  capabilities: {
    reachesAllUsNumbers: false, // only other iMessage/Apple users — SMS fallback (Phase 6) covers the rest
    deliveryReceipts: true,
    readReceipts: true,
    media: false, // v1 is text-only (D15)
    reachabilityCheck: true, // interface declares it; see checkReachability() below for current honest status
    heartbeat: true,
  },
  defaultLimits: {
    perMinute: 3,
    perDay: 100,
    newRecipientsPerHour: 15,
    replyReservePct: 15,
    jitterMs: { min: 5000, max: 15000 },
    warmupSchedule: [
      { fromDay: 1, perDay: 10 },
      { fromDay: 8, perDay: 25 },
      { fromDay: 15, perDay: 50 },
      { fromDay: 22, perDay: 75 },
      { fromDay: 29, perDay: 100 },
    ],
  },

  /**
   * @param {object} config - { serverUrl, tunnelProvider?, guid? }
   * @param {object} credentials - { password } (BlueBubbles server password)
   */
  validateConfig(config, credentials) {
    const errors = [];
    if (!config || typeof config !== "object") {
      errors.push("config is required");
    } else {
      if (!config.serverUrl || typeof config.serverUrl !== "string") {
        errors.push("config.serverUrl is required (the Cloudflare Tunnel URL in front of BlueBubbles)");
      } else if (!/^https?:\/\//.test(config.serverUrl)) {
        errors.push("config.serverUrl must start with http:// or https://");
      }
    }
    if (!credentials || !credentials.password) {
      errors.push("credentials.password is required (the BlueBubbles server password)");
    }
    return { ok: errors.length === 0, errors };
  },

  /**
   * @param {object} params
   * @param {object} params.line - the sendifyLineModel document (needs config + credentials loaded)
   * @param {object} params.credentials - decrypted credentials, OR pass line with credentials selected and omit this
   * @param {string} params.to - E.164 phone or an email (Apple ID) to message
   * @param {string} params.body
   * @param {string} params.clientMessageId - our sendifyMessageModel _id, used as BlueBubbles' tempGuid for dedupe
   */
  async send({ line, credentials, to, body, clientMessageId }) {
    try {
      const creds = credentials || credentialsFor(line);
      const client = buildClient({ serverUrl: line.config?.serverUrl, password: creds.password });

      const chatGuid = line.config?.guid || chatGuidFor(to);
      const tempGuid = clientMessageId || crypto.randomUUID();

      const result = await client.sendText({ chatGuid, tempGuid, message: body });

      // Response shape per BlueBubbles' own docs: { status, message, data: { guid, ... } }.
      // Treat anything without a usable guid as a send we can't confirm, not a hard failure —
      // the status webhook (Phase 3) is the real source of truth for delivery state.
      const providerMessageId = result?.data?.guid || tempGuid;
      return { providerMessageId, providerStatus: "sent" };
    } catch (err) {
      throw mapSendError(err);
    }
  },

  verifyWebhook({ rawBody, headers, line }) {
    // BlueBubbles' webhook signing scheme isn't settled in our research yet
    // (sendify-infra.md §5.3 flags this explicitly) — confirm against a real
    // server during Phase 3 and replace this. Until then, rely on the
    // per-line webhookKey in the URL path as the security boundary (same
    // "URL is the secret" pattern as brevoWebhookController.js), same as
    // every other inbound webhook in this codebase defaults to when a
    // provider doesn't sign.
    return true;
  },

  parseWebhook({ body }) {
    if (!body || body.type !== "new-message") return [];
    const data = body.data || {};
    if (data.isFromMe) return []; // our own outbound echoed back — not an inbound event

    return [
      {
        type: "message.received",
        providerEventId: data.guid,
        providerMessageId: data.guid,
        from: data.handle?.address,
        to: data.chats?.[0]?.guid,
        body: data.text,
        receivedAt: data.dateCreated ? new Date(data.dateCreated) : new Date(),
      },
    ];
  },

  async healthCheck({ line, credentials }) {
    try {
      const creds = credentials || credentialsFor(line);
      const client = buildClient({ serverUrl: line.config?.serverUrl, password: creds.password });
      const info = await client.getServerInfo();
      return { ok: true, details: info };
    } catch (err) {
      return { ok: false, details: err.message };
    }
  },

  /**
   * BlueBubbles doesn't document a reachability-check endpoint (confirmed
   * during this phase's research — see sendify-infra.md §5.3). Returning
   * null (unknown) is the honest answer, matching the interface's own
   * "true|false|null" contract — the router treats null the same as "needs
   * a fresh check" and just tries the send, which is the only real way to
   * find out until/unless BlueBubbles exposes something better.
   */
  async checkReachability() {
    return null;
  },

  async registerWebhooks({ line, credentials, publicUrl }) {
    const creds = credentials || credentialsFor(line);
    const client = buildClient({ serverUrl: line.config?.serverUrl, password: creds.password });
    return client.registerWebhook({ url: publicUrl, events: ["new-message", "updated-message"] });
  },
};
