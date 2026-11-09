// services/vtext/channels/imessageBluebubbles/client.js
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
    // 30s — a plain 15s wasn't enough margin for a real round trip through
    // the free ngrok tunnel to the pilot Mac; sends were completing and
    // delivering fine on BlueBubbles' side, but the confirmation response
    // kept missing the old 15s window and surfacing as a false timeout error.
    timeout: 30000,
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

    /**
     * POST /message/attachment — send one file (an image) to a chat, with no text. Works without the
     * Private API (tested live against the pilot Mac). The fields go in a multipart body, so the chat
     * guid's ";" separators are safe here (curl -F would cut them off, which is why this is not a curl call).
     */
    async sendAttachment({ chatGuid, tempGuid, name, buffer, mimeType }) {
      const form = new FormData();
      form.append("chatGuid", chatGuid);
      form.append("tempGuid", tempGuid);
      form.append("name", name);
      form.append("attachment", new Blob([buffer], { type: mimeType }), name);
      const res = await http.post("/message/attachment", form, { params: withAuth() });
      return res.data;
    },

    /** GET /server/info — cheap liveness/auth check, used by healthCheck(). */
    async getServerInfo() {
      const res = await http.get("/server/info", { params: withAuth() });
      return res.data;
    },

    /**
     * GET /chat/:guid/message — the newest messages in one chat, newest first. Used to check whether a send
     * that errored or timed out actually went out. A chat that doesn't exist yet answers 404, which is a
     * plain "no", so it returns [] instead of throwing.
     */
    async getChatMessages({ chatGuid, after, limit = 10 }) {
      try {
        const res = await http.get(`/chat/${encodeURIComponent(chatGuid)}/message`, {
          params: withAuth({ sort: "DESC", limit, ...(after ? { after } : {}) }),
        });
        return Array.isArray(res.data?.data) ? res.data.data : [];
      } catch (err) {
        if (err.response && (err.response.status === 404 || err.response.status === 400)) return [];
        throw err;
      }
    },

    /**
     * GET /message/:guid — one message straight from the Mac's Messages database, with its dateDelivered,
     * dateRead and error. Used to ask about a text whose receipt never reached us. 404 (no such message) → null.
     */
    async getMessage(guid) {
      try {
        const res = await http.get(`/message/${encodeURIComponent(guid)}`, { params: withAuth() });
        return res.data?.data || null;
      } catch (err) {
        if (err.response && (err.response.status === 404 || err.response.status === 400)) return null;
        throw err;
      }
    },

    /**
     * POST /message/query — every message (both directions, all chats) created between `after` and `before`
     * (epoch ms; BlueBubbles filters on message.date), oldest first, one page. `with: ["chat"]` brings
     * the chat guid; the sender (handle) is always joined. Checked against the v1.9.12 source.
     */
    async queryMessages({ after, before, limit = 500, offset = 0 }) {
      const res = await http.post(
        "/message/query",
        { after, before, limit, offset, sort: "ASC", with: ["chat"] },
        { params: withAuth() }
      );
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },

    /** POST /webhook — register this backend's webhook URL for new-message/updated-message events. */
    async registerWebhook({ url, events }) {
      const res = await http.post("/webhook", { url, events }, { params: withAuth() });
      return res.data;
    },
  };
}

module.exports = { buildClient };
