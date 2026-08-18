// services/voiceCallbackService.js
//
// All the logic behind human-requested callbacks, kept out of the controller
// and the scheduler so both share one source of truth.
//
// Flow:
//   1. Maya calls the scheduleCallback tool  → controller → createCallbackRequest()
//        • resolves the property's prompt (so the callback pitches the same thing)
//        • saves a CallbackRequest with callAt = the exact time asked for
//   2. voiceCallbackScheduler sweeps every minute and dials due requests.
//   3. applyOutcome() records the result:
//        • picked up → status "connected", stop
//        • no answer → nextCallAt = next 1:32 PM local (the normal retry loop)

const { DateTime } = require("luxon");
const CallbackRequest = require("../model/callbackRequestModel");
const { resolvePromptConfig } = require("./vapiPromptService");

const CALL_HOUR = 13; // 1 PM
const CALL_MINUTE = 32; // :32  → 1:32 PM local, matching the other schedulers
const DEFAULT_TZ = "America/New_York";

// Guard rails on the time a caller can ask for.
const MIN_DELAY_MINUTES = 1;
const MAX_DELAY_MINUTES = 7 * 24 * 60; // 7 days

/**
 * Next 1:32 PM in the given timezone, as a UTC Date. Today if it is still before
 * 1:32 PM there, otherwise tomorrow. DST-correct. Same helper as the schedulers.
 */
function nextDailyCallAt(timezone) {
  const zone = timezone || DEFAULT_TZ;
  let now = DateTime.now().setZone(zone);
  if (!now.isValid) now = DateTime.now().setZone(DEFAULT_TZ);

  let target = now.set({
    hour: CALL_HOUR,
    minute: CALL_MINUTE,
    second: 0,
    millisecond: 0,
  });
  if (target <= now) target = target.plus({ days: 1 });
  return target.toUTC().toJSDate();
}

/**
 * Turn what the caller asked for into an absolute Date.
 *   • delayMinutes → now + that many minutes (clamped to the guard rails)
 *   • callAtISO    → an absolute ISO 8601 time (used when they name a clock time)
 * delayMinutes wins if both are present. Returns { callAt, delayMinutes|null }.
 * Throws (statusCode 400) when neither yields a usable future time.
 */
function resolveCallbackTime({ delayMinutes, callAtISO } = {}) {
  const now = Date.now();

  if (delayMinutes !== undefined && delayMinutes !== null && delayMinutes !== "") {
    let mins = Math.round(Number(delayMinutes));
    if (!Number.isFinite(mins)) {
      const err = new Error("delayMinutes must be a number");
      err.statusCode = 400;
      throw err;
    }
    mins = Math.min(MAX_DELAY_MINUTES, Math.max(MIN_DELAY_MINUTES, mins));
    return { callAt: new Date(now + mins * 60_000), delayMinutes: mins };
  }

  if (callAtISO) {
    const dt = DateTime.fromISO(String(callAtISO));
    if (!dt.isValid) {
      const err = new Error("callAtISO is not a valid ISO 8601 time");
      err.statusCode = 400;
      throw err;
    }
    let callAt = dt.toUTC().toJSDate();
    // If the parsed time is already in the past, treat it as "as soon as possible".
    if (callAt.getTime() <= now) callAt = new Date(now + MIN_DELAY_MINUTES * 60_000);
    return { callAt, delayMinutes: null };
  }

  const err = new Error("Provide delayMinutes or callAtISO");
  err.statusCode = 400;
  throw err;
}

/**
 * Load the property's prompt so the callback pitches the same thing. Returns
 * null (dispatchCall then uses the dashboard default) when there is no
 * propertyId or no authored prompt — a callback should never fail to be booked
 * just because the prompt could not be resolved.
 */
async function resolvePromptSnapshot(propertyId) {
  if (!propertyId) return null;
  try {
    return await resolvePromptConfig(propertyId);
  } catch (_e) {
    return null;
  }
}

/**
 * Create and persist a callback request. Called from the webhook once Maya
 * fires the scheduleCallback tool.
 *
 * @param {object} args
 *   phone (required, E.164) · fullName · email · propertyId · source · note
 *   timezone · sourceCallId · delayMinutes · callAtISO
 * @returns {Promise<{ callback, spokenReply }>}
 *   spokenReply is the sentence Maya reads back to the caller.
 */
async function createCallbackRequest(args = {}) {
  const phone = String(args.phone || "").trim();
  if (!phone) {
    const err = new Error("A phone number is required to schedule a callback");
    err.statusCode = 400;
    throw err;
  }

  const { callAt, delayMinutes } = resolveCallbackTime(args);
  const promptConfig = await resolvePromptSnapshot(args.propertyId);

  const callback = await CallbackRequest.create({
    phone,
    fullName: args.fullName || "",
    email: args.email || "",
    propertyId: args.propertyId || null,
    promptConfig: promptConfig || undefined,
    source: args.source || "human-requested-callback",
    note: args.note || "",
    timezone: args.timezone || "",
    requestedDelayMinutes: delayMinutes,
    callAt,
    nextCallAt: callAt, // first dial is at the exact time asked for
    status: "pending",
  });

  return { callback, spokenReply: spokenConfirmation(callback) };
}

/**
 * Human phrasing of a delay in minutes:
 *   < 60 min  → "5 minutes"
 *   < 24 hr   → "2 hours" (with a half where it reads naturally)
 *   otherwise → "2 days"
 */
function humanizeDelay(mins) {
  const m = Math.round(Number(mins) || 0);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (m < 24 * 60) {
    const h = Math.round(m / 60);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const d = Math.round(m / (24 * 60));
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/**
 * The line Maya speaks back after booking a callback. Handles both paths:
 *   • a relative delay  → "in about 2 days" / "in about 30 minutes"
 *   • a named clock time → "tomorrow at 5:00 PM" / "on Monday at 10:00 AM"
 */
function spokenConfirmation(callback) {
  if (callback.requestedDelayMinutes) {
    return `Got it — I'll call you back in about ${humanizeDelay(callback.requestedDelayMinutes)}.`;
  }

  if (callback.callAt) {
    const zone = callback.timezone || DEFAULT_TZ;
    const dt = DateTime.fromJSDate(callback.callAt).setZone(zone);
    if (dt.isValid) {
      const now = DateTime.now().setZone(zone);
      const timeStr = dt.toFormat("h:mm a");
      let whenStr;
      if (dt.hasSame(now, "day")) whenStr = `at ${timeStr}`;
      else if (dt.hasSame(now.plus({ days: 1 }), "day")) whenStr = `tomorrow at ${timeStr}`;
      else whenStr = `on ${dt.toFormat("cccc")} at ${timeStr}`; // e.g. "on Monday at 5:00 PM"
      return `Got it — I'll call you back ${whenStr}.`;
    }
  }

  return "Got it — I've scheduled your callback and I'll call you then.";
}

/**
 * The payload runCallBurst expects (mirrors the schedulers). Pins the resolved
 * prompt so the callback speaks the right pitch. `leadId` carries the callback
 * id purely for logging.
 */
function buildBurstPayload(cb) {
  return {
    leadId: cb._id,
    fullName: cb.fullName,
    email: cb.email,
    phone: cb.phone,
    promptConfig:
      cb.promptConfig && cb.promptConfig.systemPrompt ? cb.promptConfig : undefined,
    source: cb.source || "human-requested-callback",
  };
}

/**
 * Record a dial outcome.
 *   connected → done.
 *   no answer → fall into the daily 1:32 PM retry loop (per the chosen behaviour).
 */
async function applyOutcome(cb, connected) {
  if (connected) {
    await CallbackRequest.updateOne(
      { _id: cb._id },
      { $set: { status: "connected", nextCallAt: null } }
    );
  } else {
    await CallbackRequest.updateOne(
      { _id: cb._id },
      { $set: { status: "pending", nextCallAt: nextDailyCallAt(cb.timezone) } }
    );
  }
}

module.exports = {
  CALL_HOUR,
  CALL_MINUTE,
  DEFAULT_TZ,
  nextDailyCallAt,
  resolveCallbackTime,
  createCallbackRequest,
  buildBurstPayload,
  applyOutcome,
};
