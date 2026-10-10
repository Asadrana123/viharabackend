// services/vtext/vtextAlertService.js
//
// Small helpers on top of notifyVtextAlert (services/shared/slackService.js),
// for alerts that must not repeat or that need to remember how far they have
// already reported. State lives on the Vtext settings document (alertState), in
// Mongo, so it survives restarts and is shared by every backend copy. During a
// deploy two copies run side by side for a short while, and an in-memory flag
// would let both send.
const VtextSettings = require("../../model/vtext/vtextSettingsModel");
const { getSettings } = require("./vtextSettingsService");
const { notifyVtextAlert } = require("../shared/slackService");

// Opens the Inbox on this conversation (InboxTab reads ?conversation=).
const inboxUrl = (conversationId) => {
  const base = process.env.VTEXT_ADMIN_URL || "https://vihara.ai/admin/dashboard?tab=vtext&vtextTab=inbox";
  return conversationId ? `${base}${base.includes("?") ? "&" : "?"}conversation=${conversationId}` : base;
};
const clip = (text, max = 300) => {
  const t = String(text || "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertKey(key) {
  if (!KEY_PATTERN.test(String(key))) {
    throw new Error(`alert key "${key}" may only contain letters, digits, _ and -`);
  }
}

/**
 * Sends `alert` unless an alert with the same key already fired within `cooldownMs`.
 * The decision is one atomic Mongo update: only the caller whose update matches
 * (the key is missing or older than the cooldown) stamps it and sends, so any number
 * of simultaneous callers, in any number of processes, send exactly once.
 *
 * The cooldown is used up even if Slack is unconfigured or the post fails: a stuck
 * alert must not turn into one post per attempt.
 *
 * @param {string} key - short name for the kind of alert, e.g. "backlog"
 * @param {number} cooldownMs
 * @param {object} alert - { level, title, fields } as for notifyVtextAlert
 * @returns {Promise<boolean>} true when this call won the slot, false when suppressed
 */
async function sendAlertWithCooldown(key, cooldownMs, alert) {
  assertKey(key);
  await getSettings(); // make sure the settings document exists: the update below only matches an existing one

  const now = new Date();
  const field = `alertState.${key}`;
  const won = await VtextSettings.findOneAndUpdate(
    { $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: { $lt: new Date(now.getTime() - cooldownMs) } }] },
    { $set: { [field]: now } },
    { new: true }
  ).lean();
  if (!won) return false;

  await notifyVtextAlert(alert);
  return true;
}

/**
 * Tells the team that a customer wrote in and no AI reply is on its way, so the
 * message does not sit unseen. Not rate-limited on purpose: one alert per reply.
 * Never throws.
 */
function notifyInboundNoDraft({ contact, conversationId, body, reason }) {
  return notifyVtextAlert({
    level: "warning",
    title: "Reply received, no AI reply",
    fields: [
      { label: "Contact", value: contact?.name || "(no name)" },
      { label: "Phone", value: contact?.phoneE164 },
      { label: "Their message", value: clip(body) },
      { label: "Why no AI reply", value: reason },
      { label: "Inbox", value: inboxUrl(conversationId) },
    ],
  }).catch((err) => console.error("[vtext inbound] could not send the no-AI-reply alert:", err.message));
}

/**
 * Tells the team that an AI reply has gone out to a customer, with the question and the answer.
 * Called when a draft is approved, which covers both ways a reply is sent: auto-approved by the
 * system or approved (possibly edited) by an admin. One message per reply; when the AI also said
 * a team member will follow up, that is shown here too instead of in a second alert.
 * Never throws: a Slack problem must not affect the reply.
 * @param {object} params
 * @param {object} params.message - the approved VtextMessage document
 * @param {{adminName?: string}} params.approvedBy - "AI (auto-approved)" for an automatic send
 */
async function notifyAiReplySent({ message, approvedBy }) {
  try {
    const VtextContact = require("../../model/vtext/vtextContactModel");
    const VtextMessage = require("../../model/vtext/vtextMessageModel");
    const VtextConversation = require("../../model/vtext/vtextConversationModel");
    const Product = require("../../model/property/productModel");
    const { buildPropertyContext } = require("./vtextAiReplyService");

    const [contact, question, conversation] = await Promise.all([
      VtextContact.findById(message.contactId).lean(),
      message.origin?.replyToMessageId ? VtextMessage.findById(message.origin.replyToMessageId).select("body").lean() : null,
      message.conversationId ? VtextConversation.findById(message.conversationId).select("propertyId").lean() : null,
    ]);

    // The property the customer signed up on; the conversation's own property is the fallback.
    let property = null;
    const context = await buildPropertyContext(contact);
    if (context) property = context.property_name || context.property_address;
    if (!property && conversation?.propertyId) {
      const product = await Product.findById(conversation.propertyId).select("street city").lean();
      property = product ? [product.street, product.city].filter(Boolean).join(", ") : null;
    }

    const auto = !approvedBy?.adminId && /auto/i.test(approvedBy?.adminName || "");
    const edited = message.aiDraft?.approvalStatus === "edited";
    const sentBy = auto ? "Sent automatically" : `Approved by ${approvedBy?.adminName || "an admin"}${edited ? " (edited)" : ""}`;
    const needsHuman = Boolean(message.aiDraft?.needsHuman);

    await notifyVtextAlert({
      level: needsHuman ? "warning" : "info",
      title: needsHuman ? "AI replied, team follow-up needed" : "AI replied to a customer",
      fields: [
        { label: "Contact", value: contact?.name || "(no name)" },
        { label: "Phone", value: contact?.phoneE164 },
        { label: "Property", value: property },
        { label: "Customer's question", value: clip(question?.body, 500) },
        { label: "AI reply", value: clip(message.body, 500) },
        { label: "How it was sent", value: sentBy },
        needsHuman ? { label: "Note", value: "The AI told the customer a team member will follow up." } : null,
        { label: "Inbox", value: inboxUrl(message.conversationId) },
      ].filter(Boolean),
    });
  } catch (err) {
    console.error("[vtext ai-reply] could not send the AI-reply alert:", err.message);
  }
}

/** True only when both settings that switch Vtext Slack alerts on are present. */
function isAlertingConfigured() {
  return process.env.VTEXT_ENABLE_SLACK_ALERTS === "true" && Boolean(process.env.SLACK_VTEXT_WEBHOOK_URL);
}

/** The time a watermark was last moved to, or null if it never was. */
async function getAlertWatermark(key) {
  assertKey(key);
  const settings = await VtextSettings.findOne({}, { alertState: 1 }).lean();
  const value = settings?.alertState?.[key];
  return value ? new Date(value) : null;
}

/** Moves a watermark, creating the settings document if it does not exist yet. */
async function setAlertWatermark(key, date) {
  assertKey(key);
  await VtextSettings.updateOne({}, { $set: { [`alertState.${key}`]: date } }, { upsert: true });
}

module.exports = { inboxUrl, clip, notifyInboundNoDraft, notifyAiReplySent, sendAlertWithCooldown, getAlertWatermark, setAlertWatermark, isAlertingConfigured };
