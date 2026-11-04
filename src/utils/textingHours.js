// utils/textingHours.js
//
// The earliest moment a text may go out, inside set hours in the lead's own time zone (9 AM to 8 PM by
// default, Prajwal's rule for the Toorak intro text, 3 Nov 2026). The zone comes from the phone's area code
// (utils/areaCodeTimezone.js). The area-code table isn't complete, so for an unknown code the time must be
// inside the hours in both Eastern and Pacific time (noon to 8 PM Eastern), which is safe anywhere on the
// mainland.
const { DateTime } = require("luxon");
const { AREA_CODE_TIMEZONES } = require("./areaCodeTimezone");

const SAFE_ZONES = ["America/New_York", "America/Los_Angeles"];

/** The zones whose hours apply to this number. */
function zonesForPhone(phoneE164) {
  const match = /^\+1(\d{3})\d{7}$/.exec(String(phoneE164 || ""));
  const tz = match && AREA_CODE_TIMEZONES[match[1]];
  return tz ? [tz] : SAFE_ZONES;
}

/**
 * `now` when it is already inside the hours, else the next start of the hours. Pure.
 * @param {string} phoneE164
 * @param {Date} [now]
 * @param {{ startHour?: number, endHour?: number }} [hours] - endHour is exclusive (20 = until 8 PM)
 * @returns {{ at: Date, zones: string[], waited: boolean }}
 */
function nextTextingTime(phoneE164, now = new Date(), { startHour = 9, endHour = 20 } = {}) {
  const zones = zonesForPhone(phoneE164);
  let at = DateTime.fromJSDate(now);
  // Each pass moves `at` to the next opening in a zone it falls outside of; a couple of passes settle it.
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const zone of zones) {
      const local = at.setZone(zone);
      if (local.hour >= startHour && local.hour < endHour) continue;
      const day = local.hour < startHour ? local : local.plus({ days: 1 });
      at = day.startOf("day").set({ hour: startHour });
      moved = true;
    }
    if (!moved) break;
  }
  const result = at.toJSDate();
  return { at: result, zones, waited: result.getTime() > now.getTime() };
}

module.exports = { nextTextingTime, zonesForPhone };
