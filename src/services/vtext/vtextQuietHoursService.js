// services/vtext/vtextQuietHoursService.js
//
// D11: quiet hours are enforced in the router as a DELAY, never a drop.
// Default window 8:00-21:00 in the contact's local time (env-tunable).
// Per-state stricter windows (Open Q #6 in sendify-infra.md — e.g. FL/OK
// 8am-8pm) aren't implemented yet; this is the global default only.
//
// Whether the policy is enforced AT ALL is a live admin toggle
// (vtextSettingsService.js, Settings tab) — checkQuietHours is therefore
// async now; its one caller (routeWorker.js) awaits it.
const { DateTime } = require("luxon");
const { timezoneForPhone } = require("../../utils/areaCodeTimezone");
const { getSettings } = require("./vtextSettingsService");

const START_HOUR = Number(process.env.VTEXT_QUIET_HOURS_START ?? 8);
const END_HOUR = Number(process.env.VTEXT_QUIET_HOURS_END ?? 21);

/** @param {object} contact - needs .timezone (falls back to area-code guess from .phoneE164) */
function timezoneFor(contact) {
  return contact?.timezone || timezoneForPhone(contact?.phoneE164);
}

/**
 * @param {object} contact
 * @param {Date} [at] - defaults to now
 * @returns {Promise<{ inWindow: boolean, nextWindowOpensAt: Date|null }>}
 */
async function checkQuietHours(contact, at = new Date()) {
  const { quietHoursEnabled } = await getSettings();
  if (!quietHoursEnabled) return { inWindow: true, nextWindowOpensAt: null };

  const tz = timezoneFor(contact);
  const local = DateTime.fromJSDate(at).setZone(tz);
  const hour = local.hour + local.minute / 60;

  const inWindow = hour >= START_HOUR && hour < END_HOUR;
  if (inWindow) {
    return { inWindow: true, nextWindowOpensAt: null };
  }

  // Before today's window -> opens later today. At/after today's window -> opens tomorrow.
  let nextOpen = local.set({ hour: START_HOUR, minute: 0, second: 0, millisecond: 0 });
  if (local.hour >= END_HOUR) {
    nextOpen = nextOpen.plus({ days: 1 });
  }
  return { inWindow: false, nextWindowOpensAt: nextOpen.toJSDate() };
}

module.exports = { checkQuietHours, timezoneFor, START_HOUR, END_HOUR };
