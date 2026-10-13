const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const SocialCommentReply = require("../../model/social/socialCommentReplyModel");
const { postToSlack } = require("../shared/slackService");

// AI auto-replies to new comments on our Facebook Page and Instagram posts.
// Meta delivers comments to the same webhook as leads (facebookLeadController);
// this file decides whether to answer, asks Claude for the reply, and posts it
// back as the Page / Instagram account.
//
// Off unless SOCIAL_AUTO_REPLY_ENABLED=true, so deploying this changes nothing
// until the Meta permissions are approved and someone turns it on.

const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MODEL = process.env.SOCIAL_REPLY_MODEL || "claude-opus-5-5";

// Safety cap so a viral post or a spam wave can't run up cost or get the Page
// flagged for bot behaviour. Counted per process, per rolling minute.
const MAX_REPLIES_PER_MINUTE = Number(process.env.SOCIAL_REPLY_MAX_PER_MINUTE) || 10;
const MAX_COMMENT_CHARS = 2000;

const BRAND_CONTEXT =
  process.env.SOCIAL_REPLY_BRAND_CONTEXT ||
  "Vihara is a real-estate company that helps people buy homes and investment properties.";

const SYSTEM_PROMPT = `You write the public replies our brand posts under comments on its own Facebook and Instagram posts.

About us: ${BRAND_CONTEXT}

How to reply:
- Sound like a friendly person on our social team: warm, short (1-2 sentences, under 280 characters), plain language.
- Respond to what the person actually said. Thank them for compliments, answer simple questions using only the post caption and what's written here, and for anything specific (prices, availability, showings, personal situations) invite them to send us a direct message.
- Never invent facts, prices, addresses, dates or promises. If you don't know, say we'll help them by DM.
- No hashtags. At most one emoji, and only if it fits.
- Address them by first name only if it reads naturally.

Set "reply" to false and leave "text" empty when a reply would not help or would look bad: spam, scams, links to other businesses, abusive or hateful comments, political arguments, comments that only tag a friend, or anything where a brand reply could cause harm. Put a few words of explanation in "reason".`;

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "boolean" },
    text: { type: "string" },
    reason: { type: "string" },
  },
  required: ["reply", "text", "reason"],
  additionalProperties: false,
};

let client = null;
function getClient() {
  if (!client) {
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      timeout: 60 * 1000,
      maxRetries: 2,
      ...(workspaceId && { defaultHeaders: { "anthropic-workspace-id": workspaceId } }),
    });
  }
  return client;
}

const recentReplies = [];
function underRateLimit() {
  const cutoff = Date.now() - 60 * 1000;
  while (recentReplies.length && recentReplies[0] < cutoff) recentReplies.shift();
  return recentReplies.length < MAX_REPLIES_PER_MINUTE;
}

const isEnabled = () => process.env.SOCIAL_AUTO_REPLY_ENABLED === "true";

// ─── Pull comments out of the webhook payload ───────────────────────────────

/**
 * Facebook Page webhook (object "page", field "feed"). Only new, top-level
 * comments from other people: replying to replies turns into a back-and-forth
 * thread, and replying to ourselves would loop forever.
 */
const extractFacebookComments = (body) => {
  const comments = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    const pageId = String(entry.id || "");
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const v = change.value || {};
      if (change.field !== "feed" || v.item !== "comment" || v.verb !== "add") continue;
      if (!v.comment_id || !v.message) continue;
      if (String(v.from?.id || "") === pageId) continue;
      if (v.parent_id && v.parent_id !== v.post_id) continue;
      comments.push({
        platform: "facebook",
        commentId: String(v.comment_id),
        postId: String(v.post_id || ""),
        authorId: String(v.from?.id || ""),
        authorName: v.from?.name || "",
        text: String(v.message),
      });
    }
  }
  return comments;
};

/**
 * Instagram webhook (object "instagram", field "comments"). entry.id is our
 * Instagram business account, so a matching from.id is our own reply.
 */
const extractInstagramComments = (body) => {
  const comments = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    const igAccountId = String(entry.id || "");
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const v = change.value || {};
      if (change.field !== "comments" || !v.id || !v.text) continue;
      if (String(v.from?.id || "") === igAccountId) continue;
      if (v.parent_id) continue;
      comments.push({
        platform: "instagram",
        commentId: String(v.id),
        postId: String(v.media?.id || ""),
        authorId: String(v.from?.id || ""),
        authorName: v.from?.username || "",
        text: String(v.text),
      });
    }
  }
  return comments;
};

// ─── Graph API ──────────────────────────────────────────────────────────────

const graphToken = () => process.env.FB_PAGE_ACCESS_TOKEN;

/** The post's caption gives Claude context. Best-effort: a reply without it is fine. */
const fetchPostCaption = async ({ platform, postId }) => {
  if (!postId) return "";
  const field = platform === "instagram" ? "caption" : "message";
  try {
    const { data } = await axios.get(`${GRAPH}/${postId}`, {
      params: { fields: field, access_token: graphToken() },
      timeout: 10000,
    });
    return String(data?.[field] || "");
  } catch (err) {
    console.warn(`[social-reply] couldn't read ${platform} post ${postId}:`, err.response?.data?.error?.message || err.message);
    return "";
  }
};

const postReply = async ({ platform, commentId }, message) => {
  const edge = platform === "instagram" ? "replies" : "comments";
  const { data } = await axios.post(`${GRAPH}/${commentId}/${edge}`, null, {
    params: { message, access_token: graphToken() },
    timeout: 15000,
  });
  return String(data?.id || "");
};

// ─── Claude ─────────────────────────────────────────────────────────────────

const generateReply = async (comment, caption) => {
  const userContent = [
    `Platform: ${comment.platform}`,
    `Post caption: ${caption || "(not available)"}`,
    `Commenter: ${comment.authorName || "(unknown)"}`,
    `Comment: ${comment.text.slice(0, MAX_COMMENT_CHARS)}`,
  ].join("\n");

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    // If this model declines a request, the API retries it on a fallback model.
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: REPLY_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    return { reply: false, text: "", reason: "AI declined to answer this comment" };
  }
  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(raw);
  return {
    reply: Boolean(parsed.reply) && Boolean(String(parsed.text || "").trim()),
    text: String(parsed.text || "").trim(),
    reason: String(parsed.reason || "").trim(),
  };
};

// ─── Slack ──────────────────────────────────────────────────────────────────

const notifySlack = async (comment, outcome) => {
  const webhookUrl = process.env.SLACK_SOCIAL_WEBHOOK_URL;
  if (!webhookUrl) return;
  const label = comment.platform === "instagram" ? "Instagram" : "Facebook";
  const lines = [
    `*${label} comment* from ${comment.authorName || "someone"}:`,
    `> ${comment.text.slice(0, 500)}`,
    outcome.status === "replied"
      ? `*AI replied:* ${outcome.replyText}`
      : `*No reply* (${outcome.status}): ${outcome.skipReason || outcome.error}`,
  ];
  try {
    await postToSlack(webhookUrl, { text: lines.join("\n") });
  } catch (err) {
    console.error("[social-reply] Slack notify failed:", err.message);
  }
};

// ─── Main flow ──────────────────────────────────────────────────────────────

const handleComment = async (comment) => {
  // Claim the comment first; the unique index makes a duplicate webhook a no-op.
  try {
    await SocialCommentReply.create({
      commentId: comment.commentId,
      platform: comment.platform,
      postId: comment.postId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      commentText: comment.text,
    });
  } catch (err) {
    if (err.code === 11000) return;
    throw err;
  }

  const finish = async (fields) => {
    await SocialCommentReply.updateOne({ commentId: comment.commentId }, { $set: fields });
    await notifySlack(comment, fields);
  };

  if (!underRateLimit()) {
    return finish({ status: "skipped", skipReason: `rate limit (${MAX_REPLIES_PER_MINUTE}/min)` });
  }

  try {
    const caption = await fetchPostCaption(comment);
    const decision = await generateReply(comment, caption);
    if (!decision.reply) {
      return finish({ status: "skipped", skipReason: decision.reason || "AI chose not to reply" });
    }

    recentReplies.push(Date.now());
    const replyId = await postReply(comment, decision.text);
    return finish({ status: "replied", replyText: decision.text, replyId });
  } catch (err) {
    const message = err.response?.data?.error?.message || err.message;
    console.error(`[social-reply] ${comment.platform} comment ${comment.commentId} failed:`, message);
    return finish({ status: "failed", error: message });
  }
};

/**
 * Entry point from the Meta webhook. Call after the 200 has been sent; never
 * throws, so a bad comment can't affect lead processing in the same payload.
 */
const processCommentWebhook = (body) => {
  if (!isEnabled()) return;

  let comments = [];
  if (body?.object === "page") comments = extractFacebookComments(body);
  else if (body?.object === "instagram") comments = extractInstagramComments(body);

  for (const comment of comments) {
    handleComment(comment).catch((err) =>
      console.error(`[social-reply] comment ${comment.commentId} crashed:`, err.message)
    );
  }
};

module.exports = { processCommentWebhook };
