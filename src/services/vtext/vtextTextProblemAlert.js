// services/vtext/vtextTextProblemAlert.js
//
// One Slack message per outbound text that did not get out, saying exactly what went wrong for which lead.
// Replaces the old 15-minute "N texts failed" digest.
//
// Only problems are posted. A text that got through, on iMessage or on the SMS fallback, posts nothing:
//   - iMessage failed and the SMS fallback was queued: no alert yet. If that SMS fails too, its own failure is
//     posted (with the iMessage error alongside); if it goes through, nothing is posted.
//   - iMessage failed and no SMS will go out on its own: ❌ with the reason the SMS did not happen.
//   - no delivery confirmation and the fallback waits for a person ("verify" mode): ✋ with what to click.
//   - a Twilio send that may or may not have gone out: ⚠️.
//   - a text that was never sent (its send job was lost) or gave up after its retries: 🔴.
//   - Twilio's "opted out" (21610) posts nothing here: the opt-out alert already covers it.
//
// Each text is claimed once, atomically (problemAlert.at), so a repeated receipt or a second trigger never posts
// it twice. An hourly cap turns a flood (a whole batch failing) into one summary instead of dozens of posts.
// Never throws: an alert problem must not affect sending.
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { notifyVtextAlert } = require("../shared/slackService");
const { inboxUrl, adminTabUrl, clip, sendAlertWithCooldown } = require("./vtextAlertService");
const smsFallback = require("./vtextSmsFallbackService");

const ICON = { failed: "❌", needsPerson: "✋", uncertain: "⚠️", system: "🔴" };
const perHourCap = () => Number(process.env.VTEXT_TEXT_ALERTS_PER_HOUR || 20);
const unconfirmedMinutes = () => Number(process.env.VTEXT_UNCONFIRMED_MIN || 10);

const NO_RECEIPT = "no-receipt";
const STUCK_ASSIGNED = "stuck-assigned";
const NOT_ALERTED_CODES = new Set(["OPTED_OUT", "21610"]); // the opt-out alert says it

/** Which text this was, in words: "First text: Partner Program form", "Cal.com call reminder", "Sent by hand by Adi"... */
function whichText(message) {
  const origin = message.origin || {};
  const key = origin.templateKey || "";
  let label;
  if (origin.kind === "system") {
    label = { "stop-confirm": "STOP confirmation", help: "HELP reply", "resubscribe-confirm": "Resubscribe confirmation" }[key] || "Automatic system reply";
  } else if (key.startsWith("form-intro-")) {
    const { FORM_TEXTS } = require("./formIntroTexts");
    const form = key.slice("form-intro-".length);
    label = `First text: ${FORM_TEXTS[form]?.label || form} form`;
  } else if (key.startsWith("calcom-reminder-")) {
    label = `Cal.com call reminder (${key.slice("calcom-reminder-".length)} min before)`;
  } else if (key.startsWith("followup-")) {
    label = `Follow-up text #${key.slice("followup-".length)}`;
  } else {
    label = {
      "facebook-form-intro": "First text: Facebook lead form",
      "toorak-intro": "First text: Toorak Facebook lead",
      "toorak-nov15-update": "Toorak sale update (Nov 15)",
      "property-signup-quote": "Property signup text",
      "ai-reply-draft": "AI reply",
    }[key];
  }
  if (!label) {
    const by = origin.sentBy?.adminName;
    label = { manual: `Sent by hand${by ? ` by ${by}` : ""}`, bulk: "Bulk send", api: "Sent through the API", automation: "Automatic text" }[origin.kind] || "Text";
  }
  return message.fallbackOf ? `${label} (the SMS copy)` : label;
}

/** What went wrong, in plain words, from the error the text carries. */
function whatWentWrong(message) {
  const code = String(message.error?.code || "");
  const raw = message.error?.message;
  const known = {
    22: "Not delivered on iMessage: the number is not on iMessage (most likely an Android phone or a landline).",
    MESSAGE_SEND_ERROR: "The Mac's Messages app could not send it. This usually means the number is not on iMessage.",
    INVALID_RECIPIENT: "iMessage would not accept this number.",
    [NO_RECEIPT]: `iMessage sent it, but no delivery confirmation came back within ${unconfirmedMinutes()} minutes. Usually the number is not on iMessage, or the phone is off.`,
    [STUCK_ASSIGNED]: "It was never sent: its send job was lost (a Redis outage or restart) and it waited too long to send late.",
    UNCERTAIN: "The send to Twilio was cut off, so the SMS may or may not have gone out. It was not retried, so they are not texted twice.",
    30003: "SMS not delivered: the phone is off or out of service (Twilio 30003).",
    30005: "SMS not delivered: the number does not exist (Twilio 30005).",
    30006: "SMS not delivered: a landline, or a carrier that cannot take texts (Twilio 30006).",
    30007: "SMS blocked by the carrier as spam (Twilio 30007). If this repeats, check the text wording and the 10DLC campaign.",
    30008: "SMS not delivered, the carrier gave no reason (Twilio 30008).",
    TWILIO_21211: "Twilio says this is not a valid phone number.",
    TWILIO_21214: "Twilio says this number cannot receive texts.",
    TWILIO_21408: "Twilio is not allowed to text this region.",
    TWILIO_21612: "Twilio cannot reach this number from our line.",
    TWILIO_21614: "Not a mobile number (a landline), so it cannot get texts. Marked as a landline.",
  }[code];
  if (known) return known;
  if (message.error?.kind === "transient") return `It kept failing and gave up after its retries: ${raw || "no reason recorded"}`;
  return raw || (code ? `Error ${code}` : "No reason was recorded");
}

/** What happened about the SMS fallback, in words. Only asked for iMessage texts with no SMS on its way. */
function smsFallbackWords(message, fallback) {
  if (!smsFallback.isEnabled()) return "Not sent: the SMS fallback is switched off";
  const reason = fallback?.reason || message.fallback?.reason;
  if (message.fallback?.status === "cancelled") return `Cancelled: ${reason || "no reason recorded"}`;
  if (reason) return `Not sent: ${reason}`;
  return "Not sent: this kind of error does not move to SMS by itself";
}

/**
 * Decides what (if anything) to post for a text that did not get out.
 * @returns {{ icon, title, level, wentWrong, sms?, todo }} or null when nothing should be posted
 */
async function describe(message, { fallback } = {}) {
  const code = String(message.error?.code || "");
  if (NOT_ALERTED_CODES.has(code)) return null;
  const isIMessage = message.channelType === smsFallback.IMESSAGE;
  const smsOnItsWay = fallback?.queued || ["pending", "queued"].includes(message.fallback?.status);
  if (isIMessage && !message.fallbackOf && smsOnItsWay) return null; // the SMS decides: its own failure, if any, is posted

  const wentWrong = whatWentWrong(message);
  const failedTab = `<${adminTabUrl("failed")}|Vtext → Failed>`;

  if (code === "UNCERTAIN") {
    return { icon: ICON.uncertain, level: "warning", title: "Text may or may not have gone out", wentWrong, todo: `Check the thread. If they did not get it, resend it by hand from ${failedTab}.` };
  }
  if (code === STUCK_ASSIGNED) {
    return { icon: ICON.system, level: "error", title: "Text was never sent", wentWrong, sms: isIMessage ? smsFallbackWords(message, fallback) : undefined, todo: `Retry it from ${failedTab} if it is still worth sending.` };
  }

  if (message.fallbackOf) {
    // The SMS copy of a failed iMessage failed too: the lead got nothing on either channel.
    const original = await VtextMessage.findById(message.fallbackOf).select("error").lean();
    return {
      icon: ICON.failed,
      level: "warning",
      title: "Text not delivered by iMessage or SMS",
      wentWrong: `${wentWrong}\nBefore that, iMessage: ${whatWentWrong(original || {})}`,
      todo: "Call or email them instead. The number may be wrong.",
    };
  }

  if (code === NO_RECEIPT && isIMessage && smsFallback.isEnabled() && smsFallback.noReceiptMode() === "verify" && !message.fallback?.status) {
    return {
      icon: ICON.needsPerson,
      level: "warning",
      title: "No delivery confirmation, needs a check",
      wentWrong,
      sms: "Waiting for a person (fallback is in verify mode)",
      todo: `Open ${failedTab} and click "Send by SMS", unless you know they got it.`,
    };
  }

  const isTransient = message.error?.kind === "transient" && code !== NO_RECEIPT;
  return {
    icon: isTransient ? ICON.system : ICON.failed,
    level: "warning",
    title: isTransient ? "Text failed after retries" : "Text not delivered",
    wentWrong,
    sms: isIMessage ? smsFallbackWords(message, fallback) : undefined,
    todo: isTransient
      ? `Retry it from ${failedTab}. If many texts fail like this, check the line.`
      : isIMessage
        ? `Try "Send by SMS" on ${failedTab} if the reason above can be fixed, or call / email them.`
        : "Call or email them instead. The number may be wrong.",
  };
}

async function propertyFor(message) {
  const propertyId = message.origin?.propertyId;
  let product = null;
  const Product = require("../../model/property/productModel");
  if (propertyId) product = await Product.findById(propertyId).select("productName street city").lean();
  if (!product && message.conversationId) {
    const VtextConversation = require("../../model/vtext/vtextConversationModel");
    const conv = await VtextConversation.findById(message.conversationId).select("propertyId").lean();
    if (conv?.propertyId) product = await Product.findById(conv.propertyId).select("productName street city").lean();
  }
  if (!product) return undefined;
  return [product.street, product.city].filter(Boolean).join(", ") || product.productName;
}

/**
 * Post the problem for one outbound text, if it is one worth posting and has not been posted yet.
 * @param {object|string} messageOrId - the message document (or its id); it is re-read so the alert sees its latest state
 * @param {object} [opts]
 * @param {{queued:boolean, reason?:string}} [opts.fallback] - what maybeQueueSmsFallback just answered, when it was asked
 * @param {object} [deps] - test hooks: notify(), now()
 * @returns {Promise<"posted"|"suppressed"|"skipped">}
 */
async function reportTextProblem(messageOrId, opts = {}, deps = {}) {
  try {
    const id = messageOrId?._id || messageOrId;
    const message = await VtextMessage.findById(id).lean();
    if (!message || message.direction !== "out" || message.problemAlert?.at) return "skipped";
    if (["delivered", "read"].includes(message.status)) return "skipped";

    const info = await describe(message, opts);
    if (!info) return "skipped";

    const now = deps.now ? deps.now() : new Date();
    const claimed = await VtextMessage.updateOne(
      { _id: message._id, "problemAlert.at": { $exists: false } },
      { $set: { problemAlert: { at: now, kind: info.title } } }
    );
    if (!claimed.modifiedCount) return "skipped"; // another trigger posted it

    const notify = deps.notify || notifyVtextAlert;
    const postedLastHour = await VtextMessage.countDocuments({
      _id: { $ne: message._id },
      "problemAlert.at": { $gte: new Date(now.getTime() - 3_600_000) },
      "problemAlert.kind": { $ne: "suppressed" },
    });
    if (postedLastHour >= perHourCap()) {
      await VtextMessage.updateOne({ _id: message._id }, { $set: { "problemAlert.kind": "suppressed" } });
      await sendAlertWithCooldown("text-problem-flood", 3_600_000, {
        level: "error",
        icon: ICON.system,
        title: "Many texts are failing",
        fields: [
          { label: "What happened", value: `${perHourCap()}+ texts failed in the last hour, so the rest are not posted one by one.`, wide: true },
          { label: "What to do", value: `Check the lines, then the list in <${adminTabUrl("failed")}|Vtext → Failed>.`, wide: true },
        ],
      }, { notify });
      return "suppressed";
    }

    const VtextContact = require("../../model/vtext/vtextContactModel");
    const VtextLine = require("../../model/vtext/vtextLineModel");
    const [contact, line, property] = await Promise.all([
      VtextContact.findById(message.contactId).select("name phoneE164").lean(),
      message.lineId ? VtextLine.findById(message.lineId).select("name channelType").lean() : null,
      propertyFor(message).catch(() => undefined),
    ]);

    await notify({
      level: info.level,
      icon: info.icon,
      title: info.title,
      fields: [
        { label: "Lead", value: contact?.name || "(no name)" },
        { label: "Phone", value: contact?.phoneE164 || "unknown" },
        { label: "Which text", value: whichText(message) },
        { label: "Property", value: property },
        { label: "Line", value: line?.name },
        { label: "SMS fallback", value: info.sms },
        { label: "What went wrong", value: info.wentWrong, wide: true },
        { label: "What to do", value: info.todo, wide: true },
        { label: "The text", value: clip(message.body, 300), wide: true },
        message.conversationId ? { label: "Inbox", value: `<${inboxUrl(message.conversationId)}|Open the conversation>`, wide: true } : null,
      ].filter(Boolean),
    });
    return "posted";
  } catch (err) {
    console.error("[vtext text-alert] could not post the problem alert:", err.message);
    return "skipped";
  }
}

module.exports = { reportTextProblem, whichText, whatWentWrong, describe };
