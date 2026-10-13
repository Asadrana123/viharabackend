// services/adsLoop/slackBot.js
//
// Two-way Slack for the Meta Ads Loop: the bot posts review threads and
// proposals, and reads thread replies and ✅ reactions. Uses the Slack Web
// API with the bot token (SLACK_BOT_TOKEN). Incoming requests from Slack
// (events, button clicks, the /adsloop command) are checked with the app's
// signing secret before anything is done with them.
//
// Bot scopes: chat:write, channels:history, groups:history, reactions:read,
// reactions:write, commands, users:read.

const axios = require("axios");
const crypto = require("crypto");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");

const SLACK_API = "https://slack.com/api";
const MAX_SIGNATURE_AGE_S = 60 * 5;

let botUserIdPromise = null;

async function call(method, body, { form = false } = {}) {
    const { botToken } = getAdsLoopConfig().slack;
    if (!botToken) throw new Error("SLACK_BOT_TOKEN is not set on the server");

    for (let attempt = 1; ; attempt++) {
        try {
            const { data } = await axios.post(`${SLACK_API}/${method}`, form ? new URLSearchParams(body) : body, {
                headers: {
                    Authorization: `Bearer ${botToken}`,
                    "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8",
                },
                timeout: 20000,
            });
            if (!data.ok) throw Object.assign(new Error(`Slack ${method}: ${data.error}`), { slackError: data.error });
            return data;
        } catch (error) {
            const status = error?.response?.status;
            if (status === 429 && attempt < 3) {
                const wait = Number(error.response.headers?.["retry-after"]) || 2;
                await new Promise((r) => setTimeout(r, wait * 1000));
                continue;
            }
            throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
/** @returns {Promise<{ ts: string, channel: string }>} */
async function postMessage({ channel, text, blocks, threadTs }) {
    const data = await call("chat.postMessage", {
        channel,
        text,
        ...(blocks ? { blocks } : {}),
        ...(threadTs ? { thread_ts: threadTs } : {}),
        unfurl_links: false,
        unfurl_media: false,
    });
    return { ts: data.ts, channel: data.channel };
}

const updateMessage = ({ channel, ts, text, blocks }) =>
    call("chat.update", { channel, ts, text, ...(blocks ? { blocks } : {}) });

/** Reply in a thread. Never throws, so a Slack problem can't hide the real error. */
async function replyInThread(channel, threadTs, text) {
    try {
        if (!channel) return null;
        return await postMessage({ channel, threadTs, text });
    } catch (error) {
        console.error("[adsLoop] Slack reply failed:", error.message);
        return null;
    }
}

const addReaction = (channel, ts, name) =>
    call("reactions.add", { channel, timestamp: ts, name }).catch((e) => {
        if (e.slackError !== "already_reacted") throw e;
    });

/** Every reply in a thread (oldest first). */
async function getThreadReplies(channel, threadTs) {
    const messages = [];
    let cursor;
    do {
        const data = await call("conversations.replies", { channel, ts: threadTs, limit: 200, ...(cursor ? { cursor } : {}) }, { form: true });
        messages.push(...(data.messages || []));
        cursor = data.response_metadata?.next_cursor;
    } while (cursor);
    return messages;
}

/** Channel messages after `oldest` (exclusive), oldest first. */
async function getHistorySince(channel, oldest) {
    const messages = [];
    let cursor;
    do {
        const data = await call(
            "conversations.history",
            { channel, limit: 200, ...(oldest ? { oldest } : {}), ...(cursor ? { cursor } : {}) },
            { form: true }
        );
        messages.push(...(data.messages || []));
        cursor = data.response_metadata?.next_cursor;
    } while (cursor);
    return messages.sort((a, b) => Number(a.ts) - Number(b.ts));
}

/** Who reacted with what on one message. */
async function getReactions(channel, ts) {
    const data = await call("reactions.get", { channel, timestamp: ts, full: true }, { form: true });
    return data.message?.reactions || [];
}

function getBotUserId() {
    if (!botUserIdPromise) {
        botUserIdPromise = call("auth.test", {})
            .then((d) => d.user_id)
            .catch((e) => {
                botUserIdPromise = null;
                throw e;
            });
    }
    return botUserIdPromise;
}

// ---------------------------------------------------------------------------
// Request verification
// ---------------------------------------------------------------------------
/**
 * Slack signs every request: v0=HMAC_SHA256(secret, "v0:<ts>:<raw body>").
 * @returns {boolean}
 */
function verifySlackSignature({ rawBody, timestamp, signature }) {
    const { signingSecret } = getAdsLoopConfig().slack;
    if (!signingSecret || !rawBody || !timestamp || !signature) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SIGNATURE_AGE_S) return false;

    const expected = `v0=${crypto
        .createHmac("sha256", signingSecret)
        .update(`v0:${timestamp}:${rawBody.toString("utf8")}`)
        .digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Block Kit helpers
// ---------------------------------------------------------------------------
const section = (text) => ({ type: "section", text: { type: "mrkdwn", text: String(text).slice(0, 2900) } });
const context = (text) => ({ type: "context", elements: [{ type: "mrkdwn", text: String(text).slice(0, 2900) }] });
const image = (url, alt) => ({ type: "image", image_url: url, alt_text: String(alt || "creative").slice(0, 1900) });
const button = (text, actionId, value, style) => ({
    type: "button",
    text: { type: "plain_text", text, emoji: true },
    action_id: actionId,
    value: String(value),
    ...(style ? { style } : {}),
});
const actions = (elements) => ({ type: "actions", elements });

module.exports = {
    call,
    postMessage,
    updateMessage,
    replyInThread,
    addReaction,
    getThreadReplies,
    getHistorySince,
    getReactions,
    getBotUserId,
    verifySlackSignature,
    blocks: { section, context, image, button, actions },
};
