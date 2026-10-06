// services/vtext/channels/imessageBluebubbles/adapter.js
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
 * chatGuid for a brand-new/unknown contact — "iMessage;-;+<phone>" or
 * "iMessage;-;<email>". `to` is expected pre-formatted by the caller: E.164
 * (leading +) for a phone number, or a plain email for an Apple ID.
 *
 * This was originally "any;-;..." (an assumed wildcard, flagged as unverified
 * against a real server) — confirmed WRONG during the first real-device test:
 * BlueBubbles' AppleScript generator passes the GUID's service segment
 * straight through literally into `service type = <value>`, with no wildcard
 * handling, so "any" produced invalid AppleScript ("Can't make any into type
 * constant", -1700) and every send failed. "iMessage" is the actual service
 * constant Messages.app expects there — this line has no SMS capability at
 * all (no SIM), so iMessage is the only correct value here regardless.
 */
function chatGuidFor(to) {
  return `iMessage;-;${to}`;
}

function credentialsFor(line) {
  // vtextLineModel.credentials fields are `select:false` — callers must
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
    // iMessage reports Sent and Delivered for every message it really sends, so a message still
    // "accepted" after a while never got out (the maintenance sweep marks it "unknown").
    confirmsEveryDelivery: true,
    readReceipts: true,
    media: false, // v1 is text-only (D15)
    reachabilityCheck: true, // interface declares it; see checkReachability() below for current honest status
    // BlueBubbles sends no heartbeat event (its only webhooks are new-message and
    // updated-message), so the line health sweep treats a passing healthCheck() as proof of life.
    heartbeat: false,
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
   * @param {object} params.line - the vtextLineModel document (needs config + credentials loaded)
   * @param {object} params.credentials - decrypted credentials, OR pass line with credentials selected and omit this
   * @param {string} params.to - E.164 phone or an email (Apple ID) to message
   * @param {string} params.body
   * @param {string} params.clientMessageId - our vtextMessageModel _id, used as BlueBubbles' tempGuid for dedupe
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
    if (!body) return [];
    const data = body.data || {};

    // Delivery/read receipts for our own outbound messages. BlueBubbles sends
    // "updated-message" with dateDelivered/dateRead (epoch ms) once the
    // recipient's device reports them. dateRead only appears if the recipient
    // has read receipts turned on, so "no read event" does not mean "unread".
    if (body.type === "updated-message") {
      if (!data.isFromMe || !data.guid) return [];
      const base = { type: "message.status", providerMessageId: data.guid, tempGuid: data.tempGuid };
      if (data.error) {
        // Code 22 is Messages.app's "not delivered", which is what a recipient
        // who is not registered with iMessage produces (seen live in BlueBubbles'
        // log: "Errored Msg ... Code: 22"). Other codes stay line-level.
        const notDelivered = Number(data.error) === 22;
        return [{
          ...base,
          providerEventId: `${data.guid}:failed`,
          status: "failed",
          errorKind: notDelivered ? "recipient" : "line",
          errorCode: String(data.error),
          errorMessage: notDelivered ? "Not delivered (recipient is likely not an iMessage user)" : `BlueBubbles reported send error code ${data.error}`,
          at: new Date(),
        }];
      }
      if (data.dateRead) {
        return [{ ...base, providerEventId: `${data.guid}:read`, status: "read", at: new Date(data.dateRead) }];
      }
      if (data.dateDelivered || data.isDelivered) {
        return [{ ...base, providerEventId: `${data.guid}:delivered`, status: "delivered", at: data.dateDelivered ? new Date(data.dateDelivered) : new Date() }];
      }
      return [];
    }

    if (body.type !== "new-message") return [];
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
