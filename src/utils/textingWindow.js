// utils/textingWindow.js
//
// Texting hours: US telemarketing rules (TCPA) ask for no marketing texts before 8 AM or after 9 PM in the
// recipient's local time. Two uses:
//   - textingWindow(): 8 AM-9 PM in BOTH US Eastern and US Pacific (= 11 AM-9 PM Eastern). A hard, conservative
//     check with no area code needed; scripts/textFacebookFormLeads.js still enforces it.
//   - leadTextingHours(): the Leads tab's "Text this lead". WARNING ONLY: it tells the admin when it is outside
//     8 AM-9 PM for this lead (by area code, else the Eastern+Pacific check), and the admin can send anyway.
const { AREA_CODE_TIMEZONES } = require("./areaCodeTimezone");

/** Is it inside texting hours in BOTH US Eastern and US Pacific (8 AM-9 PM each)? */
function textingWindow(now = new Date()) {
  const hourIn = (tz) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const et = hourIn("America/New_York");
  const pt = hourIn("America/Los_Angeles");
  const ok = et >= 8 && et < 21 && pt >= 8 && pt < 21;
  return { ok, et, pt };
}

/**
 * Is it 8 AM-9 PM where this number is? Uses the US area code's timezone; a number with no known area code
 * (non-US, or not in the table) falls back to textingWindow().
 * @returns {{ open: boolean, localTime?: string }} localTime e.g. "11:42 PM PDT", only when the area code is known
 */
function leadTextingHours(phoneE164, now = new Date()) {
  const match = /^\+1(\d{3})\d{7}$/.exec(String(phoneE164 || ""));
  const timezone = match && AREA_CODE_TIMEZONES[match[1]];
  if (!timezone) return { open: textingWindow(now).ok };
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now));
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(now);
  return { open: hour >= 8 && hour < 21, localTime };
}

module.exports = { textingWindow, leadTextingHours };
