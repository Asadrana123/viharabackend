// services/sendify/channels/androidSmsGateway/client.js
//
// Thin axios wrapper around capcom6/android-sms-gateway's on-device REST API
// (sendify-infra.md §5.4/Phase 6). Self-hosted, same model as BlueBubbles:
// config.serverUrl points at the phone's own exposed address (local IP on
// the LAN, or a tunnel URL for remote reach), auth is HTTP Basic against
// credentials set in the gateway app's own settings screen.
//
// API shape confirmed directly against the app's bundled OpenAPI spec
// (github.com/capcom6/android-sms-gateway, app/src/main/assets/api/swagger.json)
// during Phase 6 research — NOT yet verified against a real running device,
// same caveat as client.js's BlueBubbles counterpart had before its own
// real-device testing.
const axios = require("axios");

function buildClient({ serverUrl, username, password }) {
  if (!serverUrl) throw new Error("android-sms-gateway client: serverUrl is required");
  if (!username || !password) throw new Error("android-sms-gateway client: username and password are required");

  const http = axios.create({
    baseURL: serverUrl.replace(/\/$/, ""),
    timeout: 15000,
    auth: { username, password },
  });

  return {
    /**
     * POST /messages — enqueue an SMS on the device. Deliberately does NOT
     * pass our own message id as the gateway's `id` field: the gateway 409s
     * ("Message with such ID already exists") on a reused id, and our own
     * clientMessageId is the Mongo _id, which stays identical across a
     * retry of the same sendifyMessage — reusing it would make every retry
     * fail with a 409 instead of actually resending. A fresh random id per
     * HTTP attempt sidesteps that; our own dedupe already happens against
     * the GATEWAY's returned id (stored as provider.messageId), not this one.
     */
    async sendText({ id, to, text, simNumber }) {
      const res = await http.post("/messages", {
        id,
        phoneNumbers: [to],
        textMessage: { text },
        ...(simNumber ? { simNumber } : {}),
        withDeliveryReport: true,
      });
      return res.data; // smsgateway.GetMessageResponse — { id, state, recipients, ... }
    },

    /** GET /messages/{id} — current processing state, used by healthCheck-adjacent polling if ever needed; not on the hot send path (we rely on webhooks for status). */
    async getMessage(id) {
      const res = await http.get(`/messages/${encodeURIComponent(id)}`);
      return res.data;
    },

    /** GET /health — readiness probe, no auth required by the gateway itself, but sent through the authed client anyway since that's harmless and keeps one client shape. */
    async getHealth() {
      const res = await http.get("/health");
      return res.data;
    },

    /** POST /webhooks — registers this backend's webhook URL for one event type (the gateway requires one registration per event type, not a single multi-event one). */
    async registerWebhook({ id, url, event }) {
      const res = await http.post("/webhooks", { id, url, event });
      return res.data;
    },
  };
}

module.exports = { buildClient };
