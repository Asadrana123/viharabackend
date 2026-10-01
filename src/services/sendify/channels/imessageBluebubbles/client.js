// services/sendify/channels/imessageBluebubbles/client.js
//
// Thin axios wrapper around a BlueBubbles Server instance (reached through
// the Cloudflare Tunnel in front of the pilot Mac — see sendify-infra.md
// §5.3/§7.1). Auth is a `?password=` query param on every request — that's
// BlueBubbles' own scheme, not something we chose.
//
// API shape confirmed against BlueBubbles' own Postman docs
// (https://documenter.getpostman.com/view/765844/UV5RnfwM) during Phase 1.
// NOT yet verified against a real running server — do that as part of this
// phase's real-line test once the Apple ID/Mac/tunnel are ready.
const axios = require("axios");

function buildClient({ serverUrl, password }) {
  if (!serverUrl) throw new Error("BlueBubbles client: serverUrl is required");
  if (!password) throw new Error("BlueBubbles client: password is required");

  const http = axios.create({
    baseURL: `${serverUrl.replace(/\/$/, "")}/api/v1`,
    timeout: 15000,
  });

  const withAuth = (params = {}) => ({ ...params, password });

  return {
    /**
     * POST /message/text — send an iMessage/SMS to a chat.
     * chatGuid format: "any;-;+<E.164 phone>" or "any;-;<email>" for iMessage to an Apple ID email.
     */
    async sendText({ chatGuid, tempGuid, message }) {
      const res = await http.post(
        "/message/text",
        { chatGuid, tempGuid, message },
        { params: withAuth() }
      );
      return res.data;
    },

    /** GET /server/info — cheap liveness/auth check, used by healthCheck(). */
    async getServerInfo() {
      const res = await http.get("/server/info", { params: withAuth() });
      return res.data;
    },

    /** POST /webhook — register this backend's webhook URL for new-message/updated-message events. */
    async registerWebhook({ url, events }) {
      const res = await http.post("/webhook", { url, events }, { params: withAuth() });
      return res.data;
    },
  };
}

module.exports = { buildClient };
