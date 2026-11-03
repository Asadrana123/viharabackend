// services/calcom/calcomPayload.js
//
// Pure helpers for Cal.com booking webhooks: signature check, reading the
// payload, planning the reminder times and writing the reminder text. No
// database or network here, so it is all unit-tested (calcomPayload.test.js).
//
// Cal.com sends { triggerEvent, createdAt, payload }, signed with
// X-Cal-Signature-256 = hex HMAC-SHA256 of the raw body, keyed with the
// webhook's secret.
const crypto = require("crypto");
const { DateTime } = require("luxon");
const { normalizeInternationalPhone } = require("../../utils/internationalPhone");
const { firstNameOf } = require("../../utils/firstName");
const { timezoneForPhone } = require("../../utils/areaCodeTimezone");

/** Minutes before the call that each reminder goes out. CALCOM_REMINDER_MINUTES="30" or "1440,30". */
function reminderMinutes(raw = process.env.CALCOM_REMINDER_MINUTES) {
  const list = String(raw || "30")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(list.length ? list : [30])].sort((a, b) => b - a);
}

// Once the call is this close, a reminder is no longer sent (it would land as the call starts).
const LAST_CALL_MINUTES = 5;

/** True when the signature header matches the raw body for this secret. A missing secret never matches. */
function verifyCalSignature(rawBody, signature, secret = process.env.CALCOM_WEBHOOK_SECRET) {
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature).trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A response value can be a string or { value } (and the location question { value, optionValue }). */
function responseValue(entry) {
  if (entry == null) return "";
  if (typeof entry === "string" || typeof entry === "number") return String(entry);
  if (typeof entry === "object") {
    if (entry.optionValue) return String(entry.optionValue);
    if (typeof entry.value === "string" || typeof entry.value === "number") return String(entry.value);
  }
  return "";
}

/**
 * The attendee's phone, if the booking form collected one. Today the
 * walkthrough form asks only name, email and notes, so this is empty until a
 * phone question is added in Cal.com.
 */
function phoneFromBooking(p = {}) {
  const responses = p.responses || {};
  const candidates = [
    responseValue(responses.attendeePhoneNumber),
    p.smsReminderNumber,
    responseValue(responses.smsReminderNumber),
    p.attendees?.[0]?.phoneNumber,
    responseValue(responses.location),
    // Any other question whose key says phone (a custom "phone" / "mobile" question).
    ...Object.entries(responses)
      .filter(([k]) => /phone|mobile|cell/i.test(k))
      .map(([, v]) => responseValue(v)),
  ];
  for (const c of candidates) {
    const phone = normalizeInternationalPhone(c);
    if (phone) return phone;
  }
  return null;
}

/** The meeting link, when Cal.com sent one (Google Meet links arrive in metadata.videoCallUrl). */
function meetingUrlOf(p = {}) {
  const candidates = [p.metadata?.videoCallUrl, p.videoCallData?.url, p.location];
  return candidates.find((u) => typeof u === "string" && /^https:\/\//i.test(u)) || "";
}

/**
 * The parts of a webhook body this feature uses.
 * @returns {null | { event, uid, bookingId, rescheduleUid, startTime, endTime, eventTitle, eventSlug, attendee, formPhone, meetingUrl }}
 */
function parseBooking(body) {
  const event = body?.triggerEvent;
  const p = body?.payload;
  if (!event || !p || typeof p !== "object") return null;
  const a = p.attendees?.[0] || {};
  const responses = p.responses || {};
  const start = p.startTime ? new Date(p.startTime) : null;
  const end = p.endTime ? new Date(p.endTime) : null;
  return {
    event,
    uid: p.uid ? String(p.uid) : null,
    bookingId: Number.isFinite(Number(p.bookingId)) ? Number(p.bookingId) : undefined,
    rescheduleUid: p.rescheduleUid ? String(p.rescheduleUid) : null,
    startTime: start && !Number.isNaN(start.getTime()) ? start : null,
    endTime: end && !Number.isNaN(end.getTime()) ? end : null,
    eventTitle: p.eventTitle || p.title || "",
    eventSlug: p.type || p.eventTypeSlug || "",
    attendee: {
      name: a.name || responseValue(responses.name) || "",
      email: String(a.email || responseValue(responses.email) || "").trim().toLowerCase(),
      timeZone: a.timeZone || "",
    },
    formPhone: phoneFromBooking(p),
    meetingUrl: meetingUrlOf(p),
  };
}

/** One reminder per configured offset, skipping any whose time is already too close to the call. */
function planReminders(startTime, now = new Date(), minutesList = reminderMinutes()) {
  if (!startTime) return [];
  const start = new Date(startTime).getTime();
  const lastMoment = start - LAST_CALL_MINUTES * 60_000;
  if (now.getTime() >= lastMoment) return [];
  const plans = minutesList.map((m) => ({ minutesBefore: m, sendAt: new Date(Math.max(start - m * 60_000, now.getTime())) }));
  // Booked late (e.g. 20 min ahead): several offsets collapse to "now"; keep only one of them.
  const seen = new Set();
  return plans.filter((r) => {
    const key = r.sendAt.getTime();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when it is too late to send a reminder for a call starting at startTime. */
const isTooLate = (startTime, now = new Date()) => !startTime || now.getTime() >= new Date(startTime).getTime() - LAST_CALL_MINUTES * 60_000;

/** The attendee's timezone from Cal.com, else the phone's area code, else Eastern. */
function zoneFor(timeZone, phoneE164) {
  if (timeZone && DateTime.now().setZone(timeZone).isValid) return timeZone;
  return timezoneForPhone(phoneE164);
}

const rescheduleUrlOf = (uid) => (uid ? `https://cal.com/reschedule/${uid}` : "");

/**
 * The reminder text. DRAFT wording (2026-11-03), to be signed off by Prajwal.
 *   Hi Jane, it's Maya from Vihara. Reminder: your advisor walkthrough starts in 30 minutes, at 3:00 PM PST today.
 *   Join here: https://meet.google.com/abc
 *   Need another time? https://cal.com/reschedule/xyz
 */
function reminderText({ name, startTime, timeZone, phoneE164, meetingUrl, uid, now = new Date() }) {
  const zone = zoneFor(timeZone, phoneE164);
  const start = DateTime.fromJSDate(new Date(startTime), { zone });
  const local = DateTime.fromJSDate(now, { zone });
  // Rounded to 5 so a sweep that runs a minute late still says "30 minutes".
  const minutesLeft = Math.max(5, Math.round(start.diff(local, "minutes").minutes / 5) * 5);
  const when = start.hasSame(local, "day") ? "today" : `on ${start.toFormat("ccc, LLL d")}`;
  const clock = `${start.toFormat("h:mm a")} ${start.offsetNameShort || ""}`.trim();
  const first = firstNameOf(name || "");
  const join = meetingUrl ? `Join here: ${meetingUrl}` : "The Google Meet link is in your calendar invite.";
  const reschedule = rescheduleUrlOf(uid);
  // Links sit on their own lines, so no punctuation gets glued to them.
  return [
    `Hi${first ? ` ${first}` : ""}, it's Maya from Vihara. Reminder: your advisor walkthrough starts in ${minutesLeft} minutes, at ${clock} ${when}.`,
    join,
    reschedule ? `Need another time? ${reschedule}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  LAST_CALL_MINUTES,
  reminderMinutes,
  verifyCalSignature,
  phoneFromBooking,
  meetingUrlOf,
  parseBooking,
  planReminders,
  isTooLate,
  reminderText,
};
