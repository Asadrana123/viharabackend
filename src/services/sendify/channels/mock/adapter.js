// services/sendify/channels/mock/adapter.js
//
// Dev/test channel — no real network calls, no real device. Lets every other
// layer (queues, routing, capacity, compliance, admin UI) get built and
// tested without needing real BlueBubbles/Apple ID hardware. Only registered
// when SENDIFY_ENABLE_MOCK_CHANNEL=true (checked by registry.js, not here).
//
// Deliberately injectable failure modes via a marker in `body` (not `to` —
// by the time a message reaches an adapter's send() through the real
// enqueueOutbound pipeline, `to` is always a normalized phone/email, since
// normalizeAddress() runs before a contact is even created; a magic `to`
// value could never survive that far. `body` stays free-form all the way
// through, so that's where the trigger lives), so worker/retry/quarantine
// logic can be exercised without faking provider HTTP responses:
//   body contains "MOCK_FAIL_RECIPIENT" -> ChannelError kind "recipient"
//   body contains "MOCK_FAIL_LINE"      -> ChannelError kind "line"
//   body contains "MOCK_FAIL_TRANSIENT" -> ChannelError kind "transient"
//   body contains "MOCK_FAIL_CONFIG"    -> ChannelError kind "config"
//   anything else -> succeeds
const { ChannelError } = require("../channelError");

let mockMessageCounter = 0;

module.exports = {
  type: "mock",
  displayName: "Mock (dev/test only)",
  capabilities: {
    reachesAllUsNumbers: true,
    deliveryReceipts: true,
    readReceipts: false,
    media: false,
    reachabilityCheck: true,
    heartbeat: true,
  },
  defaultLimits: {
    perMinute: 60,
    perDay: 10000,
    newRecipientsPerHour: 1000,
    replyReservePct: 10,
    jitterMs: { min: 0, max: 0 },
    warmupSchedule: [{ fromDay: 1, perDay: 10000 }], // no real warm-up needed for mock testing
  },

  validateConfig(config) {
    return { ok: true, errors: [] };
  },

  async send({ to, body, clientMessageId }) {
    if (body?.includes("MOCK_FAIL_RECIPIENT")) {
      throw new ChannelError("recipient", "MOCK_INVALID_RECIPIENT", "Mock: simulated invalid recipient");
    }
    if (body?.includes("MOCK_FAIL_LINE")) {
      throw new ChannelError("line", "MOCK_LINE_DOWN", "Mock: simulated line failure");
    }
    if (body?.includes("MOCK_FAIL_TRANSIENT")) {
      throw new ChannelError("transient", "MOCK_TIMEOUT", "Mock: simulated transient error");
    }
    if (body?.includes("MOCK_FAIL_CONFIG")) {
      throw new ChannelError("config", "MOCK_AUTH_FAILED", "Mock: simulated config/auth error");
    }
    mockMessageCounter += 1;
    return {
      providerMessageId: clientMessageId || `mock-${Date.now()}-${mockMessageCounter}`,
      providerStatus: "sent",
    };
  },

  verifyWebhook() {
    return true; // mock webhooks (dev endpoint, Phase 1's POST /dev/mock-inbound) are same-process, no signature to check
  },

  parseWebhook({ body }) {
    // Expects { from, to, body: text, providerEventId? } from the dev mock-inbound endpoint.
    return [
      {
        type: "message.received",
        providerEventId: body.providerEventId || `mock-in-${Date.now()}`,
        providerMessageId: body.providerEventId || `mock-in-${Date.now()}`,
        from: body.from,
        to: body.to,
        body: body.body,
        receivedAt: new Date(),
      },
    ];
  },

  async healthCheck() {
    return { ok: true, details: "mock channel is always healthy" };
  },

  async checkReachability() {
    return true;
  },
};
