// services/vtext/vtextSmsFallbackService.js
//
// When an iMessage text cannot be delivered, send the same words once by SMS through the Twilio line.
//
// The rule that shapes everything here: never text a person twice. So
//   - only an EXPLICIT "not delivered" sends on its own (a send error from BlueBubbles, or a receipt with
//     one of VTEXT_SMS_FALLBACK_IMESSAGE_CODES, default error 22). A missing receipt proves nothing: the iMessage
//     may have arrived while the receipt was lost.
//   - a missing receipt (the 10-minute "unknown / no-receipt" sweep) sends on its own only when
//     VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE=auto. In "verify" (the default) a person decides with the
//     "Send by SMS" button; "off" does nothing.
//   - the fallback is always a NEW message linked to the original (fallbackOf / fallback.messageId), with the key
//     `<original key or id>-sms`, claimed atomically on the original so two triggers make one fallback.
//   - if the iMessage is confirmed after all, a fallback that has not gone out yet is cancelled; one that already
//     went out is flagged (fallback.duplicate) and alerted.
//   - the consent switch, opt-outs, texting hours and a per-hour cap apply to the fallback like any other text.
//
// Everything is OFF until VTEXT_SMS_FALLBACK_ENABLED=true.
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const { ROUTABLE_STATUSES } = VtextLine;
const { canSend } = require("./vtextComplianceService");
const { getSettings, isConsentRequired } = require("./vtextSettingsService");
const { leadTextingHours, nextTextingWindowOpen } = require("../../utils/textingWindow");
const { publishEvent } = require("./vtextEventsBus");

const IMESSAGE = "imessage-bluebubbles";
const SMS = "twilio-sms";

const isEnabled = () => process.env.VTEXT_SMS_FALLBACK_ENABLED === "true";
const noReceiptMode = () => {
  const mode = process.env.VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE;
  return ["off", "verify", "auto"].includes(mode) ? mode : "verify";
};
const iMessageCodes = () => (process.env.VTEXT_SMS_FALLBACK_IMESSAGE_CODES || "22").split(",").map((s) => s.trim()).filter(Boolean);
const maxAgeHours = () => Number(process.env.VTEXT_SMS_FALLBACK_MAX_AGE_HOURS || 24);
const maxPerHour = () => Number(process.env.VTEXT_SMS_FALLBACK_MAX_PER_HOUR || 30);

/** Does this receipt/send error mean "the recipient is not reachable on iMessage"? */
const isExplicitIMessageFailure = (errorCode) => errorCode === "MESSAGE_SEND_ERROR" || iMessageCodes().includes(String(errorCode));

const PENDING_STATUSES = ["queued", "waiting-window", "waiting-capacity", "assigned"]; // a fallback in one of these has not gone out yet

/**
 * Every check that must hold before the SMS is queued. Pure aside from reading the live consent switch and counts.
 * `retryable: true` means "not now, but not never": the original is left unclaimed so a later trigger can try again.
 * @returns {{ ok: true, scheduledFor?: Date } | { ok: false, reason: string, retryable?: boolean }}
 */
async function checkGuards(original, contact, { now, trigger }) {
  if (original.direction !== "out") return { ok: false, reason: "not an outbound text" };
  if (original.channelType !== IMESSAGE) return { ok: false, reason: "only iMessage texts fall back" };
  if (original.fallbackOf) return { ok: false, reason: "this text is itself a fallback" };
  if (original.origin?.kind === "system") return { ok: false, reason: "system replies (STOP/HELP confirmations) never fall back" };
  if (["delivered", "read"].includes(original.status)) return { ok: false, reason: "the iMessage was delivered" };

  const sentAt = original.sentAt || original.createdAt;
  if (now.getTime() - new Date(sentAt).getTime() > maxAgeHours() * 3_600_000) return { ok: false, reason: `the text is older than ${maxAgeHours()} hours` };

  if (!contact) return { ok: false, reason: "contact no longer exists" };
  if (!/^\+1\d{10}$/.test(contact.phoneE164 || "")) return { ok: false, reason: "SMS fallback is for US phone numbers only" };
  if (trigger === "no-receipt-auto" && contact.iphone?.isIphone === true) return { ok: false, reason: "this number is known to be an iPhone, so the iMessage probably arrived" };
  if (contact.lastInboundAt && new Date(contact.lastInboundAt) > new Date(sentAt)) return { ok: false, reason: "they replied after the iMessage was sent" };

  const settings = await getSettings();
  const compliance = canSend(
    contact,
    { isReplyToInbound: original.isReplyToInbound, origin: original.origin },
    { lastInboundAt: contact.lastInboundAt, requireConsent: isConsentRequired(settings) }
  );
  if (!compliance.allowed) return { ok: false, reason: compliance.reason };

  // Without a routable Twilio line the SMS would wait in the queue for good; say so instead.
  if (!(await VtextLine.exists({ channelType: SMS, status: { $in: ROUTABLE_STATUSES } }))) {
    return { ok: false, reason: "no active Twilio SMS line", retryable: true };
  }

  const sentLastHour = await VtextMessage.countDocuments({ fallbackOf: { $exists: true }, createdAt: { $gte: new Date(now.getTime() - 3_600_000) } });
  if (sentLastHour >= maxPerHour()) return { ok: false, reason: `hourly SMS fallback cap reached (${maxPerHour()})`, retryable: true };

  const hours = leadTextingHours(contact.phoneE164, now);
  return { ok: true, scheduledFor: hours.open ? undefined : nextTextingWindowOpen(contact.phoneE164, now) };
}

/** Stops a fallback text that has not gone out yet: removes its send job, frees capacity, marks it cancelled. */
async function cancelPendingFallbackMessage(message, reason, deps = {}) {
  if (message.status === "assigned" && message.lineId) {
    try {
      const getLineQueue = deps.getLineQueue || require("./queue/queues").getLineQueue;
      const job = await getLineQueue(message.lineId).getJob(`send-${message._id}`);
      if (job) await job.remove();
    } catch {
      // best-effort: the status flip below is what stops a send even if a stale job survives
    }
    const capacity = require("./vtextCapacityService");
    const line = await VtextLine.findById(message.lineId);
    if (line) await capacity.release(line, capacity.dayKey(message.updatedAt), { wasReply: message.isReplyToInbound });
  }
  message.status = "cancelled";
  message.error = { kind: "compliance", message: reason };
  await message.save();
  publishEvent({ type: "message.updated", messageId: String(message._id), conversationId: message.conversationId ? String(message.conversationId) : null, status: "cancelled" });
}

/** Fire-and-forget Slack note. Never throws. */
function alert(deps, payload) {
  try {
    const notify = deps.notify || require("../shared/slackService").notifyVtextAlert;
    Promise.resolve(notify(payload)).catch(() => {});
  } catch {
    // alerts must never break a send
  }
}

/**
 * Queue the SMS fallback for an undelivered iMessage.
 * @param {object} original - the iMessage vtextMessageModel document
 * @param {object} info
 * @param {"send-error"|"not-delivered"|"no-receipt-auto"|"manual"} info.trigger
 * @param {string} [info.reason] - why (an error code, a note)
 * @param {object} [deps] - test hooks: now(), enqueue(), notify(), getLineQueue()
 * @returns {Promise<{ queued: boolean, reason?: string, messageId?: string }>}
 */
async function maybeQueueSmsFallback(original, { trigger, reason } = {}, deps = {}) {
  if (!isEnabled()) return { queued: false, reason: "SMS fallback is switched off" };
  const now = deps.now ? deps.now() : new Date();
  const manual = trigger === "manual";

  const contact = await VtextContact.findById(original.contactId);
  const guard = await checkGuards(original, contact, { now, trigger });
  if (!guard.ok) {
    if (!guard.retryable) {
      // A permanent "no": remember it so no later trigger asks again. Only if nothing has claimed the original yet.
      await VtextMessage.updateOne(
        { _id: original._id, "fallback.status": { $exists: false } },
        { $set: { fallback: { status: "skipped", trigger, reason: guard.reason, at: now } } }
      );
    }
    return { queued: false, reason: guard.reason };
  }

  // Claim the original: whoever flips fallback.status from "unset" to "pending" owns the one fallback.
  // A person may re-try a "skipped" one by hand (the reason may have been fixed since).
  const claim = await VtextMessage.updateOne(
    { _id: original._id, ...(manual ? { $or: [{ "fallback.status": { $exists: false } }, { "fallback.status": "skipped" }] } : { "fallback.status": { $exists: false } }) },
    { $set: { fallback: { status: "pending", trigger, reason, at: now } } }
  );
  if (!claim.modifiedCount) return { queued: false, reason: "a fallback was already handled for this text" };

  const origin = original.origin?.toObject ? original.origin.toObject() : { ...(original.origin || {}) };
  delete origin._id;
  const idempotencyKey = `${original.idempotencyKey || original._id}-sms`;
  const enqueue = deps.enqueue || require("./vtextMessageService").enqueueOutbound;

  let result;
  try {
    result = await enqueue({
      to: contact.phoneE164,
      body: original.body, // the plain text; images never fall back
      origin: { ...origin, kind: origin.kind || "automation" },
      channelPolicy: { mode: "only", channels: [SMS] },
      isReplyToInbound: original.isReplyToInbound,
      idempotencyKey,
      scheduledFor: guard.scheduledFor,
      fallbackOf: original._id,
    });
  } catch (err) {
    if (err.code === 11000) {
      // The unique key already exists: another process made this fallback. Point the original at it.
      const existing = await VtextMessage.findOne({ idempotencyKey }).select("_id");
      if (existing) await VtextMessage.updateOne({ _id: original._id }, { $set: { "fallback.status": "queued", "fallback.messageId": existing._id } });
      return { queued: false, reason: "a fallback already exists", messageId: existing ? String(existing._id) : undefined };
    }
    // Could not even create it: release the claim so a later trigger can try.
    await VtextMessage.updateOne({ _id: original._id, "fallback.status": "pending" }, { $unset: { fallback: 1 } });
    throw err;
  }

  if (result.blocked) {
    await VtextMessage.updateOne({ _id: original._id }, { $set: { "fallback.status": "skipped", "fallback.reason": result.reason, "fallback.messageId": result.message._id } });
    return { queued: false, reason: result.reason, messageId: String(result.message._id) };
  }

  // pending -> queued. If it was cancelled in between (the iMessage got confirmed meanwhile), stop the new text too.
  const linked = await VtextMessage.updateOne({ _id: original._id, "fallback.status": "pending" }, { $set: { "fallback.status": "queued", "fallback.messageId": result.message._id } });
  if (!linked.modifiedCount) {
    await cancelPendingFallbackMessage(result.message, "the iMessage was confirmed while the fallback was being queued", deps);
    return { queued: false, reason: "the iMessage was confirmed first", messageId: String(result.message._id) };
  }

  // An explicit failure proves the number is not on iMessage: later texts to it go straight to SMS (the router's
  // reachability cache, 30 days). A missing receipt proves nothing, so that case leaves reachability alone.
  if (trigger === "send-error" || trigger === "not-delivered") await markIMessageUnreachable(contact, now);

  return { queued: true, messageId: String(result.message._id) };
}

async function markIMessageUnreachable(contact, now) {
  const entry = contact.channelReachability?.find((r) => r.channelType === IMESSAGE);
  if (entry) {
    entry.reachable = false;
    entry.checkedAt = now;
  } else {
    contact.channelReachability.push({ channelType: IMESSAGE, reachable: false, checkedAt: now });
  }
  await contact.save();
}

/**
 * The iMessage was confirmed (delivered / read) after a fallback was already started: undo it if it has not gone out,
 * and flag it when it has (the person got both).
 */
async function onOriginalConfirmed(original, deps = {}) {
  const status = original.fallback?.status;
  if (status !== "pending" && status !== "queued") return { action: "none" };

  if (status === "pending" && !original.fallback?.messageId) {
    // Claimed but not yet created: flipping to "cancelled" makes the creator stop (see the pending -> queued step above).
    const res = await VtextMessage.updateOne({ _id: original._id, "fallback.status": "pending" }, { $set: { "fallback.status": "cancelled", "fallback.reason": "the iMessage was delivered" } });
    return { action: res.modifiedCount ? "cancelled" : "none" };
  }

  const fallbackMessage = original.fallback?.messageId && (await VtextMessage.findById(original.fallback.messageId));
  if (!fallbackMessage) return { action: "none" };

  if (PENDING_STATUSES.includes(fallbackMessage.status)) {
    await cancelPendingFallbackMessage(fallbackMessage, "the iMessage was delivered, so the SMS was not sent", deps);
    await VtextMessage.updateOne({ _id: original._id }, { $set: { "fallback.status": "cancelled", "fallback.reason": "the iMessage was delivered" } });
    return { action: "cancelled" };
  }

  if (["sending", "accepted", "sent", "delivered", "read"].includes(fallbackMessage.status)) {
    await VtextMessage.updateOne({ _id: original._id }, { $set: { "fallback.duplicate": true } });
    const contact = await VtextContact.findById(original.contactId).select("name phoneE164").lean().catch(() => null);
    const { inboxUrl, clip } = require("./vtextAlertService");
    const { whichText } = require("./vtextTextProblemAlert");
    const minutesLate = original.deliveredAt && fallbackMessage.createdAt
      ? Math.max(1, Math.round((new Date(original.deliveredAt) - new Date(fallbackMessage.createdAt)) / 60_000))
      : null;
    alert(deps, {
      level: "warning",
      icon: "⚠️",
      title: "Lead may have got the same text twice",
      fields: [
        { label: "Lead", value: contact?.name || "(no name)" },
        { label: "Phone", value: contact?.phoneE164 },
        { label: "Which text", value: whichText(original) },
        { label: "What happened", value: `The iMessage got no confirmation, so the SMS copy went out. Then the iMessage was confirmed after all${minutesLate ? ` (${minutesLate} min after the SMS)` : ""}.`, wide: true },
        { label: "What to do", value: "Nothing usually. If they mention it, say sorry for the double text.", wide: true },
        { label: "The text", value: clip(original.body, 300), wide: true },
        original.conversationId ? { label: "Inbox", value: `<${inboxUrl(original.conversationId)}|Open the conversation>`, wide: true } : null,
      ].filter(Boolean),
    });
    return { action: "duplicate" };
  }
  return { action: "none" };
}

/**
 * Last look before a fallback text goes out (called by lineSendWorker). Cancels it when the iMessage was delivered
 * in the meantime, they replied, or the fallback was switched off; defers it to the next 9 AM when texting hours
 * have closed. Returns true when the message was handled here and must NOT be sent now.
 */
async function guardFallbackBeforeSend(message, contact, line, reservationDay, deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const capacity = require("./vtextCapacityService");
  const original = await VtextMessage.findById(message.fallbackOf);

  let cancelReason = null;
  if (!isEnabled()) cancelReason = "SMS fallback was switched off";
  else if (original && ["delivered", "read"].includes(original.status)) cancelReason = "the iMessage was delivered";
  else if (original && contact?.lastInboundAt && new Date(contact.lastInboundAt) > new Date(original.sentAt || original.createdAt)) cancelReason = "they replied after the iMessage was sent";
  else if (original && now.getTime() - new Date(original.sentAt || original.createdAt).getTime() > maxAgeHours() * 3_600_000) cancelReason = `the text is older than ${maxAgeHours()} hours`;

  if (cancelReason) {
    await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
    message.status = "cancelled";
    message.error = { kind: "compliance", message: cancelReason };
    await message.save();
    if (original) await VtextMessage.updateOne({ _id: original._id }, { $set: { "fallback.status": "cancelled", "fallback.reason": cancelReason } });
    // Delivered or replied means they have it. Any other reason leaves the lead with nothing: say so.
    if (original && !/delivered|replied/.test(cancelReason)) {
      await (deps.reportTextProblem || require("./vtextTextProblemAlert").reportTextProblem)(original._id);
    }
    return true;
  }

  if (!leadTextingHours(contact.phoneE164, now).open) {
    const until = nextTextingWindowOpen(contact.phoneE164, now);
    await capacity.release(line, reservationDay, { wasReply: message.isReplyToInbound });
    message.status = "queued";
    message.lineId = undefined;
    message.conversationId = undefined;
    message.scheduledFor = until;
    await message.save();
    const getRouteQueue = deps.getRouteQueue || require("./queue/queues").getRouteQueue;
    await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-${now.getTime()}`, delay: Math.max(0, until.getTime() - now.getTime()) });
    return true;
  }
  return false;
}

module.exports = {
  isEnabled,
  noReceiptMode,
  isExplicitIMessageFailure,
  maybeQueueSmsFallback,
  onOriginalConfirmed,
  guardFallbackBeforeSend,
  checkGuards,
  IMESSAGE,
  SMS,
};
