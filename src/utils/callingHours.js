// utils/callingHours.js
//
// The earliest moment an AUTOMATIC follow-up call may ring, in the lead's own time zone: 9 AM to 9 PM local
// (inside the federal 8 AM-9 PM calling hours). Used by followUpCadence.skipUpdate, so every daily
// follow-up sweep waits for daytime. The sign-up call is NOT held: the person just filled the form and
// asked for it, so it goes out right away at any hour (owner's rule, Nov 2026).
//
// Same zone rules as texts (utils/textingHours.js): the phone's area code decides the zone; for an area code
// not in the table the time must be inside the hours in both Eastern and Pacific (noon to 9 PM Eastern).
const { nextTextingTime } = require("./textingHours");

const CALL_START_HOUR = 9;
const CALL_END_HOUR = 21; // exclusive: until 9 PM

/**
 * `now` when calling is allowed now, else the next 9 AM in the lead's zone. Pure.
 * @param {string} phoneE164 "+1XXXXXXXXXX"
 * @param {Date} [now]
 * @returns {{ at: Date, zones: string[], waited: boolean }}
 */
function nextCallingTime(phoneE164, now = new Date()) {
  return nextTextingTime(phoneE164, now, { startHour: CALL_START_HOUR, endHour: CALL_END_HOUR });
}

module.exports = { nextCallingTime, CALL_START_HOUR, CALL_END_HOUR };
