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

module.exports = { inboxUrl, clip, notifyInboundNoDraft, sendAlertWithCooldown, getAlertWatermark, setAlertWatermark, isAlertingConfigured };
