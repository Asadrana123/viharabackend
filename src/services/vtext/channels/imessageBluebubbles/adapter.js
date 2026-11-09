// services/vtext/channels/imessageBluebubbles/adapter.js
//
// The real (non-mock) Phase-1 channel: iMessage via a self-hosted BlueBubbles
// server running on a Mac signed into a dedicated Apple ID. See
// sendify-infra.md §5.2/§5.3 for the full design and D13 for why BlueBubbles
// specifically. Capability/limit numbers are deliberately conservative —
// Apple publishes no official rate limits, so these are starting points to
// tune once the pilot line has real send history (sendify-infra.md §1, §7.6).
const { buildClient: defaultBuildClient } = require("./client");
const { mapSendError } = require("./mapErrors");
const { decryptCredentials } = require("../../../../utils/secretBox");
const { loadMedia } = require("../../vtextMediaService");
const crypto = require("crypto");

let buildClient = defaultBuildClient;
/** Tests swap in a fake BlueBubbles client; null puts the real one back. */
function setClientFactoryForTests(factory) {
  buildClient = factory || defaultBuildClient;
  serviceCache.clear();
}

/**
 * chatGuid for a 1:1 chat — "<service>;-;+<phone>" or "<service>;-;<email>". `to` is expected
 * pre-formatted by the caller: E.164 (leading +) for a phone number, or a plain email for an Apple ID.
 *
 * The service part depends on the Mac's macOS version:
 * - macOS 15 and older name a chat "iMessage;-;...". Sending to "any;-;..." there made BlueBubbles
 *   write invalid AppleScript ("Can't make any into type constant", -1700), so every send failed.
 * - macOS 26 and newer name every chat "any;-;...". BlueBubbles 1.9.10+ sends to that name fine. Sending
 *   to "iMessage;-;..." still works for a number the Mac has texted before (BlueBubbles maps it to the
 *   existing chat), but for a brand-new number Messages creates "any;-;...", BlueBubbles waits for the
 *   message in a chat that never appears, and after about 60s answers 400 although the text was delivered.
 *   Seen live on 2026-11-05 on the macOS 27 Mac Mini; a test send to a new number with "any;-;" came back
 *   200 in under a second.
 */
function chatGuidFor(to, service = "iMessage") {
  return `${service};-;${to}`;
}

const ANY_SERVICE_FROM_MACOS = 26;
const SERVICE_CACHE_TTL_MS = 60 * 60 * 1000; // the Mac's OS rarely changes; re-checked hourly, and after a line moves Macs
const serviceCache = new Map(); // serverUrl -> { service, at }

/** The major macOS version from BlueBubbles' /server/info answer ("27.0.1" -> 27), or null when it isn't there. */
function macosMajor(info) {
  const raw = info?.data?.os_version ?? info?.data?.osVersion ?? info?.os_version;
  const m = /^(\d+)/.exec(String(raw ?? "").trim());
  return m ? Number(m[1]) : null;
}

function rememberServerInfo(serverUrl, info) {
  const major = macosMajor(info);
  if (major === null) return null;
  const service = major >= ANY_SERVICE_FROM_MACOS ? "any" : "iMessage";
  serviceCache.set(serverUrl, { service, at: Date.now() });
  return service;
}

/**
 * Which chat name this line's Mac uses. When the Mac can't be asked, it falls back to "iMessage" (what
 * every macOS before 26 needs); on a newer Mac a first text may then show the 400 above, which
 * findSentCopy() below catches.
 */
async function chatServiceFor(client, serverUrl) {
  const hit = serviceCache.get(serverUrl);
  if (hit && Date.now() - hit.at < SERVICE_CACHE_TTL_MS) return hit.service;
  try {
    return rememberServerInfo(serverUrl, await client.getServerInfo()) || "iMessage";
  } catch (err) {
    console.warn(`[vtext bluebubbles] couldn't read the Mac's macOS version (${err.message}); using "iMessage;-;" chat names`);
    return "iMessage";
  }
}

// Errors where BlueBubbles may well have sent the text anyway: worth checking the chat before calling it failed.
// Left out: auth/DNS/refused (BlueBubbles never got the request) and MESSAGE_SEND_ERROR (Messages itself
// errored the message, so there is no clean sent copy to find).
const CHECK_CHAT_AFTER = new Set(["INVALID_RECIPIENT", "TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR", "UNKNOWN_ERROR"]);
const RECOVERY_WAITS_MS = [0, 5000, 15000]; // a timed-out send may still be landing in Messages
const CLOCK_SLACK_MS = 2 * 60 * 1000; // the Mac's clock and ours can differ a little

const sameText = (a, b) => String(a ?? "").replace(/\s+/g, " ").trim() === String(b ?? "").replace(/\s+/g, " ").trim();

/**
 * After a send errored, look in the chat for our own message, sent since the send started, with no error.
 * Found means the text really went out, so the caller records it as sent (and delivered, when it already
 * is) instead of failed, and nothing retries it (a retry would text the person twice).
 */
async function findSentCopy({ client, chatGuids, body, media, startedAt, sleep }) {
  for (const wait of RECOVERY_WAITS_MS) {
    if (wait) await sleep(wait);
    for (const chatGuid of chatGuids) {
      let messages;
      try {
        messages = await client.getChatMessages({ chatGuid, after: startedAt - CLOCK_SLACK_MS, limit: 10 });
      } catch (err) {
        return null; // BlueBubbles can't be reached at all, so the original error stands
      }
      const match = messages.find(
        (m) =>
          m.isFromMe &&
          !m.error &&
          (m.dateCreated || 0) >= startedAt - CLOCK_SLACK_MS &&
          (media ? (m.attachments || []).length > 0 : sameText(m.text, body))
      );
      if (match) return match;
    }
  }
  return null;
}

let sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Tests skip the waits. */
function setSleepForTests(fn) {
  sleepImpl = fn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
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
    media: true, // one image per message, no caption (send() below); no Private API needed
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
   * @param {{file: string}} [params.media] - when set, only this image is sent (an iMessage attachment carries no caption), and `body` is not
   */
  async send({ line, credentials, to, body, clientMessageId, media }) {
    let client;
    let chatGuid;
    const startedAt = Date.now();
    try {
      const creds = credentials || credentialsFor(line);
      const serverUrl = line.config?.serverUrl;
      client = buildClient({ serverUrl, password: creds.password });

      chatGuid = line.config?.guid || chatGuidFor(to, await chatServiceFor(client, serverUrl));
      const tempGuid = clientMessageId || crypto.randomUUID();

      const result = media?.file
        ? await client.sendAttachment({ chatGuid, tempGuid, ...loadMedia(media.file) })
        : await client.sendText({ chatGuid, tempGuid, message: body });

      // Response shape per BlueBubbles' own docs: { status, message, data: { guid, ... } }.
      // Treat anything without a usable guid as a send we can't confirm, not a hard failure —
      // the status webhook (Phase 3) is the real source of truth for delivery state.
      const providerMessageId = result?.data?.guid || tempGuid;
      return { providerMessageId, providerStatus: "sent" };
    } catch (err) {
      const mapped = mapSendError(err);
      if (!client || !CHECK_CHAT_AFTER.has(mapped.code)) throw mapped;

      // Both chat names, so a text is found whichever one Messages used.
      const chatGuids = [...new Set([chatGuid, chatGuidFor(to, "any"), chatGuidFor(to, "iMessage")].filter(Boolean))];
      const sent = await findSentCopy({ client, chatGuids, body, media, startedAt, sleep: sleepImpl });
      if (!sent) throw mapped;

      console.warn(`[vtext bluebubbles] send to ${chatGuid} answered ${mapped.code}, but the text is in Messages as sent (${sent.guid}); recording it as sent`);
      return {
        providerMessageId: sent.guid,
        providerStatus: "sent",
        // The delivery webhook usually came while BlueBubbles was still answering, before this message had
        // its id, so it couldn't be matched then. Carry the delivery over from the chat instead.
        deliveredAt: sent.dateDelivered ? new Date(sent.dateDelivered) : null,
        recoveredFrom: mapped.code,
      };
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
      rememberServerInfo(line.config?.serverUrl, info); // keeps the chat-name choice current for free
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

  /**
   * Asks the Mac what happened to one of our texts, for when its receipt never reached us (ngrok dropped,
   * the backend was redeploying, BlueBubbles stalled). Answers with the same status event the webhook would
   * have sent (delivered / read / failed), or [] when the Mac has nothing new (still just sent) or no such message.
   */
  async fetchMessageStatus({ line, credentials, providerMessageId }) {
    if (!providerMessageId) return [];
    const creds = credentials || credentialsFor(line);
    const client = buildClient({ serverUrl: line.config?.serverUrl, password: creds.password });
    const data = await client.getMessage(providerMessageId);
    if (!data || !data.isFromMe) return [];
    return this.parseWebhook({ body: { type: "updated-message", data } });
  },

  /**
   * Every message on the Mac created in [after, before], turned into the events the webhook would have sent:
   * a status event (delivered / read / failed) for each of our own texts, a received event for each reply.
   * Pages through the results; `maxPages` keeps one run bounded (500 messages a page).
   * @returns {Promise<object[]>} events in the parseWebhook shape
   */
  async fetchRecentEvents({ line, credentials, after, before, maxPages = 4 }) {
    const creds = credentials || credentialsFor(line);
    const client = buildClient({ serverUrl: line.config?.serverUrl, password: creds.password });
    const events = [];
    const pageSize = 500;
    for (let page = 0; page < maxPages; page += 1) {
      const rows = await client.queryMessages({ after, before, limit: pageSize, offset: page * pageSize });
      for (const data of rows) {
        events.push(...this.parseWebhook({ body: { type: data.isFromMe ? "updated-message" : "new-message", data } }));
      }
      if (rows.length < pageSize) break;
    }
    return events;
  },

  async registerWebhooks({ line, credentials, publicUrl }) {
    const creds = credentials || credentialsFor(line);
    const client = buildClient({ serverUrl: line.config?.serverUrl, password: creds.password });
    return client.registerWebhook({ url: publicUrl, events: ["new-message", "updated-message"] });
  },

  // Exposed for tests only.
  _test: { chatGuidFor, macosMajor, setClientFactoryForTests, setSleepForTests },
};
