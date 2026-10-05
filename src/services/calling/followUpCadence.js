// services/followUpCadence.js
//
// ONE follow-up cadence for every landing-page call scheduler (early access,
// NorCal, new deals, partner, property auctions, Georgia St, Rensselaer Ave).
//
//   Signup day   → the signup burst (2 calls, 60s apart) is that day's call.
//   Days 1..N    → ONE call per day, rotating 11:00 AM → 2:30 PM → 6:00 PM in
//                  the lead's timezone so we don't keep missing the same person
//                  at the same hour.
//   After day N  → stop. callStatus = "not-reached", nextCallAt = null, and an
//                  admin decides what happens next (Restart calling in the panel).
//
// The window starts at followUpStartedAt (set when an admin restarts calling)
// or, for everyone else, the lead's createdAt. N = CALL_FOLLOW_UP_DAYS (default 7).

const { DateTime } = require("luxon");

const CALL_SLOTS = [
  { hour: 11, minute: 0 },  // 11:00 AM
  { hour: 14, minute: 30 }, // 2:30 PM
  { hour: 18, minute: 0 },  // 6:00 PM
];
const FALLBACK_TZ = "America/New_York";
const FOLLOW_UP_DAYS = Math.max(1, parseInt(process.env.CALL_FOLLOW_UP_DAYS, 10) || 7);

// Follow-up days place a single call (the 2-call burst is for the signup only).
const FOLLOW_UP_CALL_OPTS = { maxCalls: 1 };

/** "now" in the lead's timezone, falling back to the page's, then Eastern. */
function localNow(lead, defaultTz, now = new Date()) {
  for (const zone of [lead.timezone, defaultTz, FALLBACK_TZ]) {
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
