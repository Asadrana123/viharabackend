// services/vtext/vtextFollowUpService.js
//
// Daily follow-up texts for a lead who registered on a property auction page
// and has not replied. State lives on VtextContact.followUp (Mongo is the
// source of truth, so a Redis flush loses nothing). A repeating maintenance job
// (runFollowUpSweep) sends whatever is due. See vtextFollowUpSequence.js for
// the copy and the send windows.
//
// Lifecycle: startFollowUp (after the welcome text) -> step 1..7, one per
// local day inside a send window -> "no-response" a few days after step 7.
// Ends early as "replied", "opted-out" or "cancelled".
const { DateTime } = require("luxon");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const Product = require("../../model/property/productModel");
const { AREA_CODE_TIMEZONES, DEFAULT_TIMEZONE } = require("../../utils/areaCodeTimezone");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { getSettings } = require("./vtextSettingsService");
const { enqueueOutbound } = require("./vtextMessageService");
const { TOTAL_STEPS, windowForStep, renderFollowUpBody } = require("./vtextFollowUpSequence");

const SWEEP_INTERVAL_MS = () => Number(process.env.VTEXT_FOLLOWUP_SWEEP_INTERVAL_MS || 15 * 60_000);
const FINAL_GRACE_DAYS = () => Number(process.env.VTEXT_FOLLOWUP_GRACE_DAYS || 2);
const BATCH_SIZE = 200;
const PRODUCT_FIELDS = "productName street city state zipCode beds baths assetType propertyType startBid slug investmentData.valuation investmentData.rental";

/**
 * Contact's area code first, then the property's timezone. timezoneForPhone()
 * can't be used here because it returns Eastern for an unknown code, which
 * would hide the property fallback.
 */
function resolveFollowUpTimezone(phoneE164, property) {
  const match = /^\+1(\d{3})\d{7}$/.exec(String(phoneE164 || ""));
  const byAreaCode = match && AREA_CODE_TIMEZONES[match[1]];
  if (byAreaCode) return byAreaCode;
  return resolvePropertyTimezone(property || {}) || DEFAULT_TIMEZONE;
}

/**
 * A random moment inside `step`'s window on the local calendar day that is
 * `daysAhead` days after `from`. The window's last minutes are skipped so a
 * sweep tick always lands before the window closes.
 */
function computeNextSendAt(from, tz, step, { daysAhead = 1, rand = Math.random } = {}) {
  const { startHour, endHour } = windowForStep(step);
  const bufferMin = Math.ceil(SWEEP_INTERVAL_MS() / 60_000) + 5;
  const spanMin = Math.max(1, (endHour - startHour) * 60 - bufferMin);
  const day = DateTime.fromJSDate(from, { zone: tz }).plus({ days: daysAhead }).startOf("day");
  return day.set({ hour: startHour }).plus({ minutes: Math.floor(rand() * spanMin) }).toJSDate();
}

/** True when `now` falls inside `step`'s window in the contact's local time. */
function isInsideWindow(now, tz, step) {
  const { startHour, endHour } = windowForStep(step);
  const local = DateTime.fromJSDate(now, { zone: tz });
  const minutes = local.hour * 60 + local.minute;
  return minutes >= startHour * 60 && minutes < endHour * 60;
}

/**
 * Enrolls a contact right after their welcome text was queued. Step 1 is
 * sent the next local day. Does nothing if follow-ups are off, the contact is
 * opted out, or a sequence is already running.
 * @returns {Promise<{ started: boolean, reason?: string }>}
 */
async function startFollowUp({ contactId, lead, property, welcomeMessageId }) {
  const settings = await getSettings();
  if (!settings.followUpsEnabled) return { started: false, reason: "follow-ups are off" };

  const contact = await VtextContact.findById(contactId).select("phoneE164 timezone optOut followUp").lean();
  if (!contact) return { started: false, reason: "contact not found" };
  if (contact.optOut?.isOptedOut) return { started: false, reason: "contact is opted out" };

  const now = new Date();
  const tz = resolveFollowUpTimezone(contact.phoneE164, property);
  const set = {
    followUp: {
      status: "active",
      leadId: lead?._id,
      propertyId: property?._id,
      timezone: tz,
      step: 0,
      startedAt: now,
      nextAt: computeNextSendAt(now, tz, 1),
      // Checked before step 1, so a welcome text that never delivered stops the sequence.
      lastMessageId: welcomeMessageId,
    },
  };
  if (!contact.timezone) set.timezone = tz;

  // The filter makes enrollment atomic: a second signup can't restart a running sequence.
  const result = await VtextContact.updateOne({ _id: contactId, "followUp.status": { $ne: "active" } }, { $set: set });
  return result.modifiedCount ? { started: true } : { started: false, reason: "a sequence is already running" };
}

/**
 * Ends an active sequence. Returns true when it was active and is now ended.
 * @param {"replied"|"opted-out"|"cancelled"|"no-response"} status
 */
async function endFollowUp(contactId, status, reason) {
  const set = { "followUp.status": status, "followUp.endedAt": new Date(), "followUp.nextAt": null };
  if (reason) set["followUp.endedReason"] = reason;
  const update = { $set: set };
  if (status === "no-response") update.$addToSet = { tags: "followup-no-response" };
  const result = await VtextContact.updateOne({ _id: contactId, "followUp.status": "active" }, update);
  return result.modifiedCount > 0;
}

async function lastMessageProblem(messageId) {
  if (!messageId) return null;
  const message = await VtextMessage.findById(messageId).select("status error").lean();
  if (!message) return null;
  if (message.status === "failed" && message.error?.kind === "recipient") return "undeliverable number";
  // iMessage accepted it but never confirmed delivery (usually a number that is not on iMessage)
  if (message.status === "unknown" && message.error?.code === "no-receipt") return "no delivery confirmation";
  if (message.status === "blocked") return `blocked: ${message.error?.message || "compliance"}`;
  return null;
}

async function processDueContact(contactId, now) {
  const contact = await VtextContact.findById(contactId).lean();
  const f = contact?.followUp;
  if (!f || f.status !== "active" || !f.nextAt || f.nextAt > now) return;

  if (contact.optOut?.isOptedOut) {
    await endFollowUp(contactId, "opted-out", "contact opted out");
    return;
  }
  if (contact.lastInboundAt && contact.lastInboundAt >= f.startedAt) {
    await endFollowUp(contactId, "replied", "contact replied");
    return;
  }
  const problem = await lastMessageProblem(f.lastMessageId);
  if (problem) {
    await endFollowUp(contactId, "cancelled", problem);
    return;
  }

  const step = f.step + 1;
  const tz = f.timezone || contact.timezone || DEFAULT_TIMEZONE;

  // Missed the window (a sweep ran late, or the worker was down). Try again
  // tomorrow at the same step instead of sending outside the window.
  if (!isInsideWindow(now, tz, step)) {
    await VtextContact.updateOne(
      { _id: contactId, "followUp.status": "active", "followUp.nextAt": f.nextAt },
      { $set: { "followUp.nextAt": computeNextSendAt(now, tz, step) } }
    );
    return;
  }

  // Claim the step. Clearing nextAt keeps an overlapping sweep from picking this contact up too.
  const claimed = await VtextContact.findOneAndUpdate(
    { _id: contactId, "followUp.status": "active", "followUp.step": f.step, "followUp.nextAt": f.nextAt },
    { $set: { "followUp.nextAt": null } }
  );
  if (!claimed) return;

  const product = f.propertyId ? await Product.findById(f.propertyId).select(PRODUCT_FIELDS).lean() : null;
  const body = renderFollowUpBody(step, { name: contact.name, product });

  let message = null;
  let blockedReason = null;
  try {
    const result = await enqueueOutbound({
      to: contact.phoneE164,
      body,
      origin: { kind: "automation", templateKey: `followup-${step}` },
      idempotencyKey: `followup-${contactId}-${step}`,
      isReplyToInbound: false,
    });
    message = result.message;
    if (result.blocked) blockedReason = result.reason || "blocked";
  } catch (err) {
    if (err?.code !== 11000) {
      // Put the step back so the next sweep tick retries it.
      console.error(`[vtext follow-up] enqueue failed for contact ${contactId} step ${step}:`, err.message);
      await VtextContact.updateOne({ _id: contactId, "followUp.status": "active" }, { $set: { "followUp.nextAt": f.nextAt } });
      return;
    }
    // Duplicate idempotency key: this step was already enqueued once. Move on.
    message = await VtextMessage.findOne({ idempotencyKey: `followup-${contactId}-${step}` }).select("_id").lean();
  }

  if (blockedReason) {
    await endFollowUp(contactId, "cancelled", `blocked: ${blockedReason}`);
    console.error(`[vtext follow-up] contact ${contactId} step ${step} blocked: ${blockedReason}`);
    return;
  }

  const isLast = step >= TOTAL_STEPS;
  const set = {
    "followUp.step": step,
    "followUp.lastSentAt": now,
    "followUp.lastMessageId": message?._id,
    "followUp.nextAt": isLast ? null : computeNextSendAt(now, tz, step + 1),
  };
  if (isLast) set["followUp.finalCheckAt"] = DateTime.fromJSDate(now).plus({ days: FINAL_GRACE_DAYS() }).toJSDate();
  await VtextContact.updateOne({ _id: contactId, "followUp.status": "active" }, { $set: set });
  console.log(`[vtext follow-up] contact ${contactId} step ${step}/${TOTAL_STEPS} queued (message ${message?._id})`);
}

async function flagNoResponse(now) {
  const due = await VtextContact.find({
    "followUp.status": "active",
    "followUp.step": TOTAL_STEPS,
    "followUp.finalCheckAt": { $lte: now },
  })
    .limit(BATCH_SIZE)
    .select("followUp.lastMessageId")
    .lean();

  for (const c of due) {
    try {
      const problem = await lastMessageProblem(c.followUp?.lastMessageId);
      if (problem) await endFollowUp(c._id, "cancelled", problem);
      else await endFollowUp(c._id, "no-response", `no reply after ${TOTAL_STEPS} follow-ups`);
    } catch (err) {
      console.error(`[vtext follow-up] final check failed for contact ${c._id}:`, err.message);
    }
  }
}

/** Maintenance job: send every follow-up that is due, then flag finished sequences. */
async function runFollowUpSweep() {
  const settings = await getSettings();
  if (!settings.followUpsEnabled) return;

  const now = new Date();
  const due = await VtextContact.find({ "followUp.status": "active", "followUp.nextAt": { $lte: now } })
    .sort({ "followUp.nextAt": 1 })
    .limit(BATCH_SIZE)
    .select("_id")
    .lean();

  for (const c of due) {
    try {
      await processDueContact(c._id, now);
    } catch (err) {
      console.error(`[vtext follow-up] contact ${c._id} failed:`, err.message);
    }
  }
  await flagNoResponse(now);
}

module.exports = {
  startFollowUp,
  endFollowUp,
  runFollowUpSweep,
  resolveFollowUpTimezone,
  computeNextSendAt,
  isInsideWindow,
};
