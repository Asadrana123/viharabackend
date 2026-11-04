// services/vtext/channels/twilioSms/adapter.js
//
// Real SMS through Twilio, sent from a Messaging Service that carries our
// approved A2P 10DLC campaign. It exists as the FALLBACK for the iMessage line:
// iMessage only reaches iPhones, so a text to an Android number never gets a
// receipt. This channel reaches every US mobile number.
//
// It is `fallbackOnly`: vtextRouter leaves it out of the default channel list,
// so a message only goes out through Twilio when something asks for it by name
// (channelPolicy {mode:"only", channels:["twilio-sms"]}), which is what the SMS
// fallback does. Adding the channel never changes how existing texts route.
//
// Per-line data (nothing Twilio-specific lives in env vars):
//   line.address                  the Twilio number, E.164 (shown in the admin; sends go through the service)
//   line.config.messagingServiceSid   "MG…", the service tied to the approved campaign
//   line.config.manageServiceWebhooks optional, true lets registerWebhooks() set the service's inbound URL
//   line.credentials (encrypted)  { accountSid, authToken, apiKeySid?, apiKeySecret? }
const { buildClient } = require("./client");
const { mapSendError, errorKindForStatusCode } = require("./mapErrors");
const { ChannelError } = require("../channelError");
const { decryptCredentials } = require("../../../../utils/secretBox");
const { buildWebhookUrl } = require("../../vtextWebhookUrl");

const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const MESSAGING_SERVICE_SID = /^MG[0-9a-fA-F]{32}$/;
const API_KEY_SID = /^SK[0-9a-fA-F]{32}$/;

// How long Twilio keeps trying to deliver before it gives up (seconds). A text
// that arrives hours late reads as a stray message, so the default is 4 hours.
const VALIDITY_SECONDS = () => Number(process.env.VTEXT_TWILIO_VALIDITY_SECONDS || 14400);

function credentialsFor(line) {
  // vtextLineModel.credentials fields are `select:false` — load the line with
  // .select("+credentials.iv +credentials.tag +credentials.ciphertext") before sending.
  if (!line.credentials || !line.credentials.ciphertext) {
    throw new Error(`Line ${line._id} has no stored credentials — was it loaded with +credentials selected?`);
  }
  return decryptCredentials(line.credentials);
}

function clientFor(line, credentials) {
  return buildClient(credentials || credentialsFor(line));
}

/** Twilio sends form fields; a status callback carries ?cb=status&mid=<our message id> (set in send()). */
const isStatusCallback = (query) => query?.cb === "status";

module.exports = {
  type: "twilio-sms",
  displayName: "SMS (Twilio, fallback)",
  capabilities: {
    reachesAllUsNumbers: true, // carrier SMS reaches any US mobile number
    deliveryReceipts: true, // status callbacks: sent / delivered / undelivered / failed
    confirmsEveryDelivery: false, // some carriers never report; "sent" with no "delivered" is normal
    readReceipts: false,
    media: false, // text only; the send worker's plain-body path is used
    reachabilityCheck: false,
    heartbeat: false, // Twilio is a cloud API; healthCheck() reads the Messaging Service instead
    fallbackOnly: true, // never part of default routing (see vtextRouter.resolveChannelCandidates)
    providerHandlesKeywords: true, // Twilio's Advanced Opt-Out answers STOP / START / HELP itself
    requiresExplicitLimits: true, // a line cannot be activated until its limits are set by hand (see startWarmup)
  },
  // PLACEHOLDERS, deliberately low, and never trusted: a Twilio line cannot be activated until someone sets its own
  // limits (perMinute, perDay, newRecipientsPerHour) from the approved campaign and the carrier daily cap shown in the
  // Twilio console. The fallback only carries the texts an iMessage could not deliver, so low numbers cost little.
  // No warm-up ramp: an approved campaign has its throughput from day one, so perDay applies immediately.
  defaultLimits: {
    perMinute: 10,
    perDay: 200,
    newRecipientsPerHour: 60,
    replyReservePct: 10,
    jitterMs: { min: 0, max: 1000 },
    warmupSchedule: [],
    // Skip the "halve the cap when few people reply" throttle (vtextCapacityService): fallback texts go to numbers
    // that were never reachable on iMessage and reply less, and carriers already police SMS quality themselves.
    replyRatioThrottle: false,
  },

  /**
   * @param {object} config - { messagingServiceSid, manageServiceWebhooks? }
   * @param {object} credentials - { accountSid, authToken, apiKeySid?, apiKeySecret? }
   */
  validateConfig(config, credentials) {
    const errors = [];
    if (!config || typeof config !== "object") {
      errors.push("config is required");
    } else {
      if (!config.messagingServiceSid || !MESSAGING_SERVICE_SID.test(config.messagingServiceSid)) {
        errors.push("config.messagingServiceSid is required and looks like MG followed by 32 hex characters (the Messaging Service tied to the approved campaign)");
      }
      if (config.manageServiceWebhooks !== undefined && typeof config.manageServiceWebhooks !== "boolean") {
        errors.push("config.manageServiceWebhooks must be true or false if set");
      }
    }
    if (!credentials || typeof credentials !== "object") {
      errors.push("credentials are required");
    } else {
      if (!credentials.accountSid || !ACCOUNT_SID.test(credentials.accountSid)) {
        errors.push("credentials.accountSid is required and looks like AC followed by 32 hex characters");
      }
      if (!credentials.authToken || typeof credentials.authToken !== "string") {
        errors.push("credentials.authToken is required (it also checks Twilio's webhook signatures, even when an API key sends the texts)");
      }
      const hasKeySid = credentials.apiKeySid !== undefined && credentials.apiKeySid !== "";
      const hasKeySecret = credentials.apiKeySecret !== undefined && credentials.apiKeySecret !== "";
      if (hasKeySid !== hasKeySecret) {
        errors.push("credentials.apiKeySid and credentials.apiKeySecret must be given together");
      } else if (hasKeySid && !API_KEY_SID.test(credentials.apiKeySid)) {
        errors.push("credentials.apiKeySid looks like SK followed by 32 hex characters");
      }
    }
    return { ok: errors.length === 0, errors };
  },

  /**
   * @param {object} params
   * @param {object} params.line - needs config + credentials loaded
   * @param {object} [params.credentials] - decrypted credentials, or omit and load them from the line
   * @param {string} params.to - E.164 phone to text
   * @param {string} params.body
   * @param {string} params.clientMessageId - our message _id; carried on the status-callback URL so a receipt finds its message
   */
  async send({ line, credentials, to, body, clientMessageId }) {
    try {
      const messagingServiceSid = line.config?.messagingServiceSid;
      if (!messagingServiceSid) {
        throw new ChannelError("config", "NO_MESSAGING_SERVICE", `Line ${line._id} has no config.messagingServiceSid`);
      }
      // Without a public URL Twilio cannot report delivery, and a fallback we cannot see is worse than none.
      const webhookUrl = buildWebhookUrl(line);
      if (!webhookUrl) {
        throw new ChannelError("config", "NO_PUBLIC_URL", "VTEXT_PUBLIC_BASE_URL is not set, so Twilio has nowhere to send delivery receipts");
      }

      const client = clientFor(line, credentials);
      const result = await client.sendText({
        messagingServiceSid,
        to,
        body,
        statusCallback: `${webhookUrl}?cb=status&mid=${encodeURIComponent(String(clientMessageId))}`,
        validityPeriod: VALIDITY_SECONDS(),
        smartEncoded: true, // swaps curly quotes and similar for plain ones so a message stays in cheaper GSM-7 segments
      });

      return {
        providerMessageId: result.sid,
        providerStatus: result.status || "queued",
        segments: result.numSegments !== undefined ? Number(result.numSegments) : undefined,
      };
    } catch (err) {
      throw mapSendError(err);
    }
  },

  /**
   * Twilio signs every webhook: X-Twilio-Signature is an HMAC of the exact public
   * URL plus the sorted form fields, keyed with the account auth token. The
   * controller passes `url` (public base + original path and query) and the
   * parsed form `body`. Fails closed when either is missing.
   */
  verifyWebhook({ headers, body, url, line }) {
    const signature = headers?.["x-twilio-signature"];
    if (!signature || !url || !body || !line) return false;
    const { authToken } = credentialsFor(line);
    return require("twilio").validateRequest(authToken, signature, url, body);
  },

  /** Twilio only needs a 200 and an (empty) TwiML document; an empty <Response/> means "send no automatic reply". */
  webhookResponse() {
    return { status: 200, contentType: "text/xml", body: "<Response></Response>" };
  },

  parseWebhook({ body, query }) {
    if (!body || !body.MessageSid) return [];

    // A delivery receipt for a text we sent.
    if (isStatusCallback(query)) {
      const providerStatus = String(body.MessageStatus || "").toLowerCase();
      const base = {
        type: "message.status",
        providerEventId: `${body.MessageSid}:${providerStatus}`,
        providerMessageId: body.MessageSid,
        tempGuid: query.mid,
        at: new Date(),
      };
      // queued / accepted / scheduled / sending: we already hold "accepted" from the send itself.
      if (providerStatus === "sent") return [{ ...base, status: "sent" }];
      if (providerStatus === "delivered") return [{ ...base, status: "delivered" }];
      if (providerStatus === "read") return [{ ...base, status: "read" }];
      if (providerStatus === "undelivered" || providerStatus === "failed") {
        return [
          {
            ...base,
            status: "failed",
            errorCode: body.ErrorCode ? String(body.ErrorCode) : "TWILIO_FAILED",
            errorKind: errorKindForStatusCode(body.ErrorCode),
            errorMessage: `Twilio reported ${providerStatus}${body.ErrorCode ? ` (error ${body.ErrorCode})` : ""}`,
          },
        ];
      }
      return [];
    }

    // A text from a person to our Twilio number.
    return [
      {
        type: "message.received",
        providerEventId: body.MessageSid,
        providerMessageId: body.MessageSid,
        from: body.From,
        to: body.To,
        body: body.Body || "",
        receivedAt: new Date(),
        // Twilio's Advanced Opt-Out sets this to STOP / START / HELP when it handled a keyword.
        optOutType: body.OptOutType ? String(body.OptOutType).toUpperCase() : undefined,
      },
    ];
  },

  /** Reads the Messaging Service: proves the credentials work and the service id exists. */
  async healthCheck({ line, credentials }) {
    try {
      const client = clientFor(line, credentials);
      const service = await client.getMessagingService(line.config?.messagingServiceSid);
      return { ok: Boolean(service?.sid), details: { sid: service?.sid, friendlyName: service?.friendlyName } };
    } catch (err) {
      return { ok: false, details: err.message };
    }
  },

  /** Every US mobile number can receive SMS. Implemented honestly even though the router never calls it for this channel. */
  async checkReachability() {
    return true;
  },

  /**
   * The Messaging Service may be shared (OTP codes, other apps), so we only change
   * its inbound URL when the line says we own it (config.manageServiceWebhooks).
   * Otherwise we hand back the URL to paste into the Twilio console.
   */
  async registerWebhooks({ line, credentials, publicUrl }) {
    if (line.config?.manageServiceWebhooks !== true) {
      return {
        manual: true,
        instructions: `In the Twilio console, open Messaging > Services > ${line.config?.messagingServiceSid || "your service"} > Integration, choose "Send a webhook", and set the request URL to ${publicUrl} (HTTP POST).`,
      };
    }
    const client = clientFor(line, credentials);
    const service = await client.updateMessagingService(line.config.messagingServiceSid, {
      inboundRequestUrl: publicUrl,
      inboundMethod: "POST",
      // The service's own URL is ignored while it defers to the sender's (number's) webhook, so turn that off.
      useInboundWebhookOnNumber: false,
    });
    return { manual: false, inboundRequestUrl: service?.inboundRequestUrl };
  },
};
