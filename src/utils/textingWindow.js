// utils/textingWindow.js
//
// Texting hours: US telemarketing rules (TCPA) ask for no marketing texts before 8 AM or after 9 PM in the
// recipient's local time. Our own rule is tighter: 9 AM-8 PM for every text we start (Prajwal, 6 Nov 2026;
// same hours as utils/textingHours.js). Replies to someone who texted us are not held. Uses:
//   - textingWindow(): 9 AM-8 PM in BOTH US Eastern and US Pacific (= noon-8 PM Eastern). A hard, conservative
//     check with no area code needed; scripts/textFacebookFormLeads.js still enforces it.
//   - leadTextingHours(): the Leads tab's "Text this lead". WARNING ONLY: it tells the admin when it is outside
//     9 AM-8 PM for this lead (by area code, else the Eastern+Pacific check), and the admin can send anyway.
//   - nextTextingWindowOpen(): holds an SMS fallback until the hours open.
const { AREA_CODE_TIMEZONES } = require("./areaCodeTimezone");

const START_HOUR = 9;
const END_HOUR = 20; // exclusive: until 8 PM
const inHours = (hour) => hour >= START_HOUR && hour < END_HOUR;

/** Is it inside texting hours in BOTH US Eastern and US Pacific (9 AM-8 PM each)? */
function textingWindow(now = new Date()) {
  const hourIn = (tz) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const et = hourIn("America/New_York");
  const pt = hourIn("America/Los_Angeles");
  const ok = inHours(et) && inHours(pt);
  return { ok, et, pt };
}

/**
 * Is it 9 AM-8 PM where this number is? Uses the US area code's timezone; a number with no known area code
 * (non-US, or not in the table) falls back to textingWindow().
 * @returns {{ open: boolean, localTime?: string }} localTime e.g. "11:42 PM PDT", only when the area code is known
 */
function leadTextingHours(phoneE164, now = new Date()) {
  const match = /^\+1(\d{3})\d{7}$/.exec(String(phoneE164 || ""));
  const timezone = match && AREA_CODE_TIMEZONES[match[1]];
  if (!timezone) return { open: textingWindow(now).ok };
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now));
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(now);
  return { open: inHours(hour), localTime };
}

/**
 * The next moment (to the nearest 15 minutes) when it is 9 AM-8 PM where this number is. Returns `now` when it is already open.
 * Used to hold an SMS fallback until morning instead of texting someone at night.
 */
function nextTextingWindowOpen(phoneE164, now = new Date()) {
  const STEP_MS = 15 * 60 * 1000;
  for (let t = now.getTime(); t <= now.getTime() + 36 * 3_600_000; t += STEP_MS) {
    const at = new Date(t);
    if (leadTextingHours(phoneE164, at).open) return at;
  }
  return new Date(now.getTime() + 12 * 3_600_000); // unreachable in practice: the window is open 11 hours a day
}

module.exports = { textingWindow, leadTextingHours, nextTextingWindowOpen, START_HOUR, END_HOUR };
