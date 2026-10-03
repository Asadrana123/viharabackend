// services/vtext/channels/androidSmsGateway/adapter.js
//
// Phase 6's SMS fallback channel (sendify-infra.md §5.4): real SMS sent from
// an Android phone running capcom6/android-sms-gateway, a free open-source
// app that exposes a REST API + webhooks over the phone's own SIM. See the
// research doc (linked from sendify-infra.md §5.4) for why this path was
// chosen over a purpose-built hardware gateway or a Mac+iPhone/Messages.app
// setup, and for the CTIA P2P volume ceilings the limits below are based on.
//
// This is a carrier SIM, not Apple's iMessage network — it reaches every US
// mobile number (capabilities.reachesAllUsNumbers: true), unlike the
// iMessage-only channel, which is exactly what makes a
// `channelPolicy: {mode:"prefer", channels:["imessage-bluebubbles","android-sms"]}`
// send meaningful: vtextRouter tries iMessage first and only reaches this
// adapter when the contact isn't iMessage-reachable (or that policy isn't used
// at all, in which case this is just one of the two channels tried in order).
const { buildClient } = require("./client");
const { mapSendError } = require("./mapErrors");
const { decryptCredentials } = require("../../../../utils/secretBox");
const crypto = require("crypto");

function credentialsFor(line) {
  // vtextLineModel.credentials fields are `select:false` — callers must
  // .select("+credentials.iv +credentials.tag +credentials.ciphertext") when
  // loading the line doc for a send, same requirement as every other channel.
  if (!line.credentials || !line.credentials.ciphertext) {
    throw new Error(`Line ${line._id} has no stored credentials — was it loaded with +credentials selected?`);
  }
  return decryptCredentials(line.credentials);
}

function clientFor(line, credentials) {
  const creds = credentials || credentialsFor(line);
  return buildClient({ serverUrl: line.config?.serverUrl, username: creds.username, password: creds.password });
}

module.exports = {
  type: "android-sms",
  displayName: "SMS (Android Gateway)",
  capabilities: {
    reachesAllUsNumbers: true, // real SMS over a carrier SIM — the whole point of this channel existing
    deliveryReceipts: true, // sms:delivered webhook, when the carrier supports delivery reports
    readReceipts: false, // SMS has no concept of this
    media: false, // the gateway supports MMS, but v1 here is text-only (matches the iMessage channel's own D15 scope decision)
    reachabilityCheck: false, // every US mobile number is reachable by definition; no check needed or offered
    heartbeat: true, // via GET /health (readiness) — no system:ping-based heartbeat wired yet, see healthCheck() below
  },
  // No official carrier limits exist (CTIA publishes guidelines, not hard
  // numbers, and each carrier enforces differently) — these are the research
  // doc's conservative planning baseline (≤1,000/day, ≤15/min, ≤100 unique
  // recipients/hour per CTIA's P2P guidance), not a guarantee against
  // throttling. Tune once a real line has send history, same as the iMessage
  // channel's own defaultLimits comment says.
  defaultLimits: {
    perMinute: 12,
    perDay: 800,
    newRecipientsPerHour: 100,
    replyReservePct: 10,
    jitterMs: { min: 2000, max: 8000 },
    warmupSchedule: [
      { fromDay: 1, perDay: 80 },
      { fromDay: 8, perDay: 200 },
      { fromDay: 15, perDay: 400 },
      { fromDay: 22, perDay: 600 },
      { fromDay: 29, perDay: 800 },
    ],
  },

  /**
   * @param {object} config - { serverUrl, simNumber? } — serverUrl is the phone's own exposed address (LAN IP:8080, or a tunnel URL for remote reach)
   * @param {object} credentials - { username, password } (the gateway app's own Basic Auth credentials, set in its settings screen)
   */
  validateConfig(config, credentials) {
    const errors = [];
    if (!config || typeof config !== "object") {
      errors.push("config is required");
    } else {
      if (!config.serverUrl || typeof config.serverUrl !== "string") {
        errors.push("config.serverUrl is required (the phone's exposed android-sms-gateway address)");
      } else if (!/^https?:\/\//.test(config.serverUrl)) {
        errors.push("config.serverUrl must start with http:// or https://");
      }
      if (config.simNumber !== undefined && (!Number.isInteger(config.simNumber) || config.simNumber < 1 || config.simNumber > 3)) {
        errors.push("config.simNumber must be an integer between 1 and 3 if set");
      }
    }
    if (!credentials || !credentials.username || !credentials.password) {
      errors.push("credentials.username and credentials.password are required (the gateway app's Basic Auth credentials)");
    }
    return { ok: errors.length === 0, errors };
  },

  /**
   * @param {object} params
   * @param {object} params.line - the vtextLineModel document (needs config + credentials loaded)
   * @param {object} params.credentials - decrypted credentials, OR pass line with credentials selected and omit this
   * @param {string} params.to - E.164 phone to text
   * @param {string} params.body
   * @param {string} params.clientMessageId - our vtextMessageModel _id; used for our own logging only, NOT sent as the gateway's `id` (see client.js)
   */
  async send({ line, credentials, to, body, clientMessageId }) {
    try {
      const client = clientFor(line, credentials);
      const requestId = crypto.randomUUID();

      const result = await client.sendText({ id: requestId, to, text: body, simNumber: line.config?.simNumber });

      // result.id is the gateway's own id for this message — what every
      // subsequent sms:sent/sms:delivered/sms:failed webhook will reference
      // as `messageId`. Fall back to our own request id if the response is
      // somehow missing one, same defensive pattern as the BlueBubbles adapter.
      const providerMessageId = result?.id || requestId;
      return { providerMessageId, providerStatus: "sent" };
    } catch (err) {
      throw mapSendError(err);
    }
  },

  verifyWebhook() {
    // The gateway's Webhook registration schema has no secret/signature field
    // at all (confirmed directly against its OpenAPI spec during Phase 6
    // research) — there is no HMAC scheme to check. Same "URL is the secret"
    // fallback as every other unsigned provider in this codebase: the
    // per-line webhookKey in the URL path (vtextWebhookController.js) is
    // the actual security boundary, not this function.
    return true;
  },

  parseWebhook({ body }) {
    if (!body || !body.event) return [];
    const { event, payload = {} } = body;

    if (event === "sms:received") {
      return [
        {
          type: "message.received",
          providerEventId: body.id,
          providerMessageId: payload.messageId,
          from: payload.sender,
          to: payload.recipient,
          body: payload.message,
          receivedAt: payload.receivedAt ? new Date(payload.receivedAt) : new Date(),
        },
      ];
    }

    if (event === "sms:sent" || event === "sms:delivered") {
      return [
        {
          type: "message.status",
          providerEventId: body.id,
          providerMessageId: payload.messageId,
          status: event === "sms:sent" ? "sent" : "delivered",
          at: new Date(payload.sentAt || payload.deliveredAt || Date.now()),
        },
      ];
    }

    if (event === "sms:failed") {
      return [
        {
          type: "message.status",
          providerEventId: body.id,
          providerMessageId: payload.messageId,
          status: "failed",
          errorCode: "GATEWAY_FAILED",
          errorMessage: payload.reason,
          at: payload.failedAt ? new Date(payload.failedAt) : new Date(),
        },
      ];
    }

    if (event === "system:ping") {
      return [{ type: "line.heartbeat", providerEventId: body.id, at: new Date() }];
    }

    // sms:cancelled, MMS events, app:started, batch variants — not handled
    // in this v1 (text-only, no MMS; cancellation already flows one-way from
    // us via the queue, not something we need confirmed back).
    return [];
  },

  /** GET /health — the gateway's own readiness probe. Confirms the gateway app is reachable and ready; does not confirm cellular signal or SIM state specifically (the API exposes no such check). */
  async healthCheck({ line, credentials }) {
    try {
      const client = clientFor(line, credentials);
      const info = await client.getHealth();
      return { ok: info?.status === "pass", details: info };
    } catch (err) {
      return { ok: false, details: err.message };
    }
  },

  /**
   * Every US mobile number can receive SMS — there's nothing to check.
   * vtextRouter only calls this for channels where capabilities.reachesAllUsNumbers
   * is false, so this is never actually invoked, but it's implemented
   * honestly (not omitted) in case that assumption ever changes.
   */
  async checkReachability() {
    return true;
  },

  /**
   * The gateway requires one webhook registration PER event type (its own
   * POST /webhooks schema takes a single `event` enum value, not a list) —
   * unlike BlueBubbles' one-call-covers-several-events registerWebhook.
   * Registers the three event types inboundWorker actually handles.
   */
  async registerWebhooks({ line, credentials, publicUrl }) {
    const client = clientFor(line, credentials);
    const events = ["sms:received", "sms:sent", "sms:delivered", "sms:failed"];
    const results = [];
    for (const event of events) {
      results.push(await client.registerWebhook({ id: `${line._id}-${event}`, url: publicUrl, event }));
    }
    return results;
  },
};
