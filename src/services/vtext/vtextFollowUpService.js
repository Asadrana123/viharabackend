// services/vtext/vtextFollowUpService.js
//
// Follow-up texts for a lead who signed up on a property auction page and has
// not replied, registered or booked a call. State lives on
// VtextContact.followUp (Mongo is the source of truth, so a Redis flush loses
// nothing). A repeating maintenance job (runFollowUpSweep) sends whatever is
// due. See vtextFollowUpSequence.js for the copy, the target days and the
// rules (one text a day for 7 days, skip a missed day, stop before the auction).
//
// Lifecycle: startFollowUp (after the signup text) -> each step on its target
// day inside a send window -> "no-response" a few days after the last step.
// Ends early as "replied", "opted-out" or "cancelled" (registered, booked a
// call, undeliverable, ...).
const { DateTime } = require("luxon");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const Product = require("../../model/property/productModel");
const { AREA_CODE_TIMEZONES, DEFAULT_TIMEZONE } = require("../../utils/areaCodeTimezone");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { getSettings } = require("./vtextSettingsService");
const { enqueueOutbound } = require("./vtextMessageService");
const { PRODUCT_TEMPLATE_FIELDS, resolvePropertyVariables, resolveContactVariables, renderTemplate, checkRendered } = require("./vtextTemplateService");
const { auctionDayOf } = require("./vtextFormatters");
const { hasRegistered } = require("./vtextRegistrationLookup");
const { endFollowUp, endFollowUpsForRegistration } = require("./vtextFollowUpEnd");
const { SEQUENCE_VERSION, TOTAL_STEPS, windowForStep, stepDefinition, valuesForStep, planFollowUps } = require("./vtextFollowUpSequence");

const SWEEP_INTERVAL_MS = () => Number(process.env.VTEXT_FOLLOWUP_SWEEP_INTERVAL_MS || 15 * 60_000);
const FINAL_GRACE_DAYS = () => Number(process.env.VTEXT_FOLLOWUP_GRACE_DAYS || 2);
const BATCH_SIZE = 200;

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

/** The local calendar day ("YYYY-MM-DD") of an instant in `tz`. */
const localDay = (date, tz) => DateTime.fromJSDate(new Date(date), { zone: tz }).toISODate();

/**
 * A random moment inside `step`'s window on the local calendar day `day`
 * ("YYYY-MM-DD"). The window's last minutes are skipped so a sweep tick always
 * lands before the window closes.
 */
function computeSendAtOnDay(day, tz, step, { rand = Math.random } = {}) {
  const { startHour, endHour } = windowForStep(step);
  const bufferMin = Math.ceil(SWEEP_INTERVAL_MS() / 60_000) + 5;
  const spanMin = Math.max(1, (endHour - startHour) * 60 - bufferMin);
  return DateTime.fromISO(day, { zone: tz })
    .startOf("day")
    .set({ hour: startHour })
    .plus({ minutes: Math.floor(rand() * spanMin) })
    .toJSDate();
}

/** "before", "inside" or "after" `step`'s window, in the contact's local time. */
function windowState(now, tz, step) {
  const { startHour, endHour } = windowForStep(step);
  const local = DateTime.fromJSDate(now, { zone: tz });
  const minutes = local.hour * 60 + local.minute;
  if (minutes < startHour * 60) return "before";
  return minutes < endHour * 60 ? "inside" : "after";
}

/** True when `now` falls inside `step`'s window in the contact's local time. */
const isInsideWindow = (now, tz, step) => windowState(now, tz, step) === "inside";

/**
 * Enrolls a contact right after their signup text was queued. Does nothing
 * if follow-ups are off, the contact is opted out, a sequence is already
 * running, or no step fits before the auction.
 * @returns {Promise<{ started: boolean, reason?: string }>}
 */
async function startFollowUp({ contactId, lead, property, signupMessageId, now = new Date() }) {
  const settings = await getSettings();
  if (!settings.followUpsEnabled) return { started: false, reason: "follow-ups are off" };

  const contact = await VtextContact.findById(contactId).select("phoneE164 timezone optOut followUp").lean();
  if (!contact) return { started: false, reason: "contact not found" };
  if (contact.optOut?.isOptedOut) return { started: false, reason: "contact is opted out" };

  const tz = resolveFollowUpTimezone(contact.phoneE164, property);
  const signupDay = localDay(now, tz);
  // The signup text went out today, so today is taken.
  const plan = planFollowUps({ signupDay, today: signupDay, auctionDay: auctionDayOf(property), takenDays: [signupDay] });
  if (!plan.length) return { started: false, reason: "no follow-up fits before the auction" };

  const set = {
    followUp: {
      status: "active",
      sequenceVersion: SEQUENCE_VERSION,
      leadId: lead?._id,
      propertyId: property?._id,
      timezone: tz,
      step: 0,
      doneSteps: [],
      startedAt: now,
      nextAt: computeSendAtOnDay(plan[0].day, tz, plan[0].step),
      // Checked before the first follow-up, so a signup text that never delivered stops the sequence.
      lastMessageId: signupMessageId,
    },
  };
  if (!contact.timezone) set.timezone = tz;

  // The filter makes enrollment atomic: a second signup can't restart a running sequence.
  const result = await VtextContact.updateOne({ _id: contactId, "followUp.status": { $ne: "active" } }, { $set: set });
  return result.modifiedCount ? { started: true } : { started: false, reason: "a sequence is already running" };
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

/**
 * Re-plans from the contact's state and either schedules the next step or, with
 * none left, starts the wait for a reply. `extra` is merged into the same update.
 */
async function scheduleNext(contactId, { f, tz, auctionDay, now, doneSteps, takenDays, extra = {} }) {
  const plan = planFollowUps({
    signupDay: localDay(f.startedAt, tz),
    today: localDay(now, tz),
    auctionDay,
    doneSteps,
    takenDays,
  });
  const set = { ...extra, "followUp.doneSteps": doneSteps };
  if (plan.length) {
    set["followUp.nextAt"] = computeSendAtOnDay(plan[0].day, tz, plan[0].step);
  } else {
    set["followUp.nextAt"] = null;
    set["followUp.finalCheckAt"] = DateTime.fromJSDate(now).plus({ days: FINAL_GRACE_DAYS() }).toJSDate();
  }
  await VtextContact.updateOne({ _id: contactId, "followUp.status": "active" }, { $set: set });
  return plan;
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
  // Enrolled under an older sequence version: it was replaced, so it ends here.
  if (f.sequenceVersion !== SEQUENCE_VERSION) {
    await endFollowUp(contactId, "cancelled", "sequence replaced");
    return;
  }
  const problem = await lastMessageProblem(f.lastMessageId);
  if (problem) {
    await endFollowUp(contactId, "cancelled", problem);
    return;
  }
  if (await hasRegistered({ propertyId: f.propertyId, phoneE164: contact.phoneE164, leadId: f.leadId })) {
    await endFollowUp(contactId, "cancelled", "registered");
    return;
  }

  const tz = f.timezone || contact.timezone || DEFAULT_TIMEZONE;
  const product = f.propertyId ? await Product.findById(f.propertyId).select(PRODUCT_TEMPLATE_FIELDS).lean() : null;
  if (!product) {
    await endFollowUp(contactId, "cancelled", "property not found");
    return;
  }

  const auctionDay = auctionDayOf(product);
  const doneSteps = f.doneSteps || [];
  const today = localDay(now, tz);
  const takenDays = [localDay(f.startedAt, tz)];
  if (f.lastSentAt) takenDays.push(localDay(f.lastSentAt, tz));

  const plan = planFollowUps({ signupDay: localDay(f.startedAt, tz), today, auctionDay, doneSteps, takenDays });
  const entry = plan[0];
  if (!entry) {
    // Nothing left that fits (the auction date moved, or every step was skipped).
    if (!f.step) await endFollowUp(contactId, "cancelled", "no follow-ups were due");
    else await scheduleNext(contactId, { f, tz, auctionDay, now, doneSteps, takenDays });
    return;
  }

  // Not today (the auction date changed since this was scheduled): move it.
  if (entry.day !== today) {
    await VtextContact.updateOne(
      { _id: contactId, "followUp.status": "active", "followUp.nextAt": f.nextAt },
      { $set: { "followUp.nextAt": computeSendAtOnDay(entry.day, tz, entry.step) } }
    );
    return;
  }

  const state = windowState(now, tz, entry.step);
  if (state === "before") {
    await VtextContact.updateOne(
      { _id: contactId, "followUp.status": "active", "followUp.nextAt": f.nextAt },
      { $set: { "followUp.nextAt": computeSendAtOnDay(today, tz, entry.step) } }
    );
    return;
  }
  if (state === "after") {
    // Missed the window (a sweep ran late, or the worker was down). The day has passed, so the step is skipped, never sent late.
    console.error(`[vtext follow-up] contact ${contactId} step ${entry.step} skipped: its send window passed`);
    await scheduleNext(contactId, { f, tz, auctionDay, now, doneSteps: [...doneSteps, entry.step], takenDays });
    return;
  }

  const def = stepDefinition(entry.step);
  const values = valuesForStep(def, { ...resolvePropertyVariables(product), ...resolveContactVariables(contact.name) });
  const body = renderTemplate(def.body, values);
  const renderProblem = checkRendered(def.body, body, values, def.required);
  if (renderProblem) {
    console.error(`[vtext follow-up] contact ${contactId} step ${entry.step} skipped: ${renderProblem}`);
    await scheduleNext(contactId, { f, tz, auctionDay, now, doneSteps: [...doneSteps, entry.step], takenDays });
    return;
  }

  // Claim the step. Clearing nextAt keeps an overlapping sweep from picking this contact up too.
  const claimed = await VtextContact.findOneAndUpdate(
    { _id: contactId, "followUp.status": "active", "followUp.step": f.step, "followUp.nextAt": f.nextAt },
    { $set: { "followUp.nextAt": null } }
  );
  if (!claimed) return;

  const step = entry.step;
  let message = null;
  let blockedReason = null;
  try {
    const result = await enqueueOutbound({
      to: contact.phoneE164,
      body,
      origin: { kind: "automation", templateKey: `followup-${step}`, propertyId: f.propertyId },
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

  await scheduleNext(contactId, {
    f,
    tz,
    auctionDay,
    now,
    doneSteps: [...doneSteps, step],
    takenDays: [...takenDays, today],
    extra: {
      "followUp.step": (f.step || 0) + 1,
      "followUp.lastSentAt": now,
      "followUp.lastMessageId": message?._id,
    },
  });
  console.log(`[vtext follow-up] contact ${contactId} step ${step} (${(f.step || 0) + 1} sent, up to ${TOTAL_STEPS}) queued (message ${message?._id})`);
}

async function flagNoResponse(now) {
  const due = await VtextContact.find({ "followUp.status": "active", "followUp.finalCheckAt": { $lte: now } })
    .limit(BATCH_SIZE)
    .select("followUp.lastMessageId followUp.step")
    .lean();

  for (const c of due) {
    try {
      const problem = await lastMessageProblem(c.followUp?.lastMessageId);
      if (problem) await endFollowUp(c._id, "cancelled", problem);
      else await endFollowUp(c._id, "no-response", `no reply after ${c.followUp?.step || 0} follow-ups`);
    } catch (err) {
      console.error(`[vtext follow-up] final check failed for contact ${c._id}:`, err.message);
    }
  }
}

/** Maintenance job: send every follow-up that is due, then flag finished sequences. */
async function runFollowUpSweep({ now = new Date() } = {}) {
  const settings = await getSettings();
  if (!settings.followUpsEnabled) return;


  // Sequences from an older version end right away. Ones that already finished all their steps and are
  // only waiting out the reply grace period (they have a finalCheckAt) are left for flagNoResponse.
  await VtextContact.updateMany(
    { "followUp.status": "active", "followUp.sequenceVersion": { $ne: SEQUENCE_VERSION }, "followUp.finalCheckAt": { $exists: false } },
    { $set: { "followUp.status": "cancelled", "followUp.endedAt": now, "followUp.endedReason": "sequence replaced", "followUp.nextAt": null } }
  );

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
  endFollowUpsForRegistration,
  runFollowUpSweep,
  resolveFollowUpTimezone,
  computeSendAtOnDay,
  isInsideWindow,
};
