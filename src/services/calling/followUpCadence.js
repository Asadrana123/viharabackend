// services/followUpCadence.js
//
// ONE follow-up cadence for every landing-page call scheduler (early access,
// NorCal, new deals, partner, property auctions, Georgia St, Rensselaer Ave).
//
//   Signup day   → the single signup call is that day's call.
//   Days 1..N    → ONE call per day, rotating 11:00 AM → 2:30 PM → 6:00 PM in
//                  the lead's timezone so we don't keep missing the same person
//                  at the same hour.
//   After day N  → stop. callStatus = "not-reached", nextCallAt = null, and an
//                  admin decides what happens next (Restart calling in the panel).
//
// The window starts at followUpStartedAt (set when an admin restarts calling)
// or, for everyone else, the lead's createdAt. N = CALL_FOLLOW_UP_DAYS (default 7).

const { DateTime } = require("luxon");
const { callTimezone } = require("../../utils/areaCodeTimezone");
const { nextCallingTime } = require("../../utils/callingHours");
const { toUsSmsNumber } = require("../../utils/usPhone");

const CALL_SLOTS = [
  { hour: 11, minute: 0 },  // 11:00 AM
  { hour: 14, minute: 30 }, // 2:30 PM
  { hour: 18, minute: 0 },  // 6:00 PM
];
const FALLBACK_TZ = "America/New_York";
const FOLLOW_UP_DAYS = Math.max(1, parseInt(process.env.CALL_FOLLOW_UP_DAYS, 10) || 7);

// Every call is a single dial — no 60s re-ring (only requested callbacks do that).
const FOLLOW_UP_CALL_OPTS = { maxCalls: 1 };

/** "now" in the lead's timezone (a US phone's area code first, then the saved one), falling back to the page's, then Eastern. */
function localNow(lead, defaultTz, now = new Date()) {
  const leadTz = callTimezone(lead.phoneNormalized || lead.phone, lead.timezone);
  for (const zone of [leadTz, defaultTz, FALLBACK_TZ]) {
    if (!zone) continue;
    const dt = DateTime.fromJSDate(now).setZone(zone);
    if (dt.isValid) return dt;
  }
  return DateTime.fromJSDate(now).setZone(FALLBACK_TZ);
}

/** Local start-of-day the follow-up window counts from. */
function windowStartDay(lead, zoneNow) {
  const start = lead.followUpStartedAt || lead.createdAt || zoneNow.toJSDate();
  return DateTime.fromJSDate(new Date(start)).setZone(zoneNow.zone).startOf("day");
}

/** Whole calendar days between two local start-of-day DateTimes (DST-safe). */
const dayDiff = (a, b) => Math.round(a.diff(b, "days").days);

/**
 * When the next follow-up call is due, as a UTC Date — always on a later
 * calendar day than today (one call per day). null once the window is over.
 */
function nextFollowUpAt(lead = {}, defaultTz, now = new Date()) {
  const zoneNow = localNow(lead, defaultTz, now);
  const nextDay = zoneNow.startOf("day").plus({ days: 1 });
  const dayIndex = Math.max(1, dayDiff(nextDay, windowStartDay(lead, zoneNow)));
  if (dayIndex > FOLLOW_UP_DAYS) return null;

  const slot = CALL_SLOTS[(dayIndex - 1) % CALL_SLOTS.length];
  return nextDay.set({ hour: slot.hour, minute: slot.minute }).toUTC().toJSDate();
}

/** $set for a lead that did not pick up: next day's slot, or "not-reached". */
function noAnswerUpdate(lead, defaultTz) {
  const nextCallAt = nextFollowUpAt(lead, defaultTz);
  return nextCallAt
    ? { callStatus: "no-answer", nextCallAt }
    : { callStatus: "not-reached", nextCallAt: null };
}

/**
 * Sweep guard. Returns null when the lead may be dialed now, otherwise the $set
 * to apply instead of calling:
 *   • window already over          → "not-reached"
 *   • already called today (local) → move to the next day's slot
 *   • outside 9 AM–9 PM local      → wait for the next 9 AM (utils/callingHours.js)
 * Also moves leads from the old 3-calls-a-day loop onto this cadence.
 */
function skipUpdate(lead, defaultTz, now = new Date()) {
  const zoneNow = localNow(lead, defaultTz, now);
  const today = zoneNow.startOf("day");
  if (dayDiff(today, windowStartDay(lead, zoneNow)) > FOLLOW_UP_DAYS) {
    return { callStatus: "not-reached", nextCallAt: null };
  }
  if (lead.lastCallAt) {
    const last = DateTime.fromJSDate(new Date(lead.lastCallAt)).setZone(zoneNow.zone).startOf("day");
    if (+last === +today) return noAnswerUpdate(lead, defaultTz);
  }
  // Never at night: an automatic follow-up only rings 9 AM-9 PM in the lead's zone (area code; an unknown
  // code must fit both Eastern and Pacific). Outside that it waits for the next 9 AM. The sign-up call
  // itself is not held — the person just asked for it (Nov 2026).
  const hold = nextCallingTime(toUsSmsNumber(lead.phoneNormalized || lead.phone) || "", now);
  if (hold.waited) return { nextCallAt: hold.at };
  return null;
}

module.exports = {
  CALL_SLOTS,
  FOLLOW_UP_DAYS,
  FOLLOW_UP_CALL_OPTS,
  nextFollowUpAt,
  noAnswerUpdate,
  skipUpdate,
};
