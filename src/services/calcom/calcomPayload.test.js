const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { verifyCalSignature, parseBooking, planReminders, isTooLate, reminderText, reminderMinutes, reminderEvents, isReminderEvent } = require("./calcomPayload");

const START = new Date("2026-11-04T23:00:00Z"); // 3:00 PM PST
const min = (n) => n * 60_000;

const createdBody = (over = {}) => ({
  triggerEvent: "BOOKING_CREATED",
  createdAt: "2026-11-03T10:00:00Z",
  payload: {
    uid: "abc123",
    bookingId: 200,
    eventTitle: "Advisor Walkthrough",
    type: "walkthrough",
    startTime: START.toISOString(),
    endTime: new Date(START.getTime() + min(30)).toISOString(),
    attendees: [{ name: "Jane Doe", email: "Jane@Example.com ", timeZone: "America/Los_Angeles" }],
    responses: { name: "Jane Doe", email: "jane@example.com", notes: "" },
    location: "integrations:google:meet",
    metadata: { videoCallUrl: "https://meet.google.com/abc-defg-hij" },
    ...over,
  },
});

test("signature: right secret passes, wrong one and no secret fail", () => {
  const raw = Buffer.from(JSON.stringify(createdBody()));
  const sig = crypto.createHmac("sha256", "s3cret").update(raw).digest("hex");
  assert.equal(verifyCalSignature(raw, sig, "s3cret"), true);
  assert.equal(verifyCalSignature(raw, sig.toUpperCase(), "s3cret"), true);
  assert.equal(verifyCalSignature(raw, sig, "other"), false);
  assert.equal(verifyCalSignature(raw, sig, ""), false);
  assert.equal(verifyCalSignature(raw, undefined, "s3cret"), false);
});

test("parseBooking reads the booking; no phone when the form has none", () => {
  const b = parseBooking(createdBody());
  assert.equal(b.event, "BOOKING_CREATED");
  assert.equal(b.uid, "abc123");
  assert.equal(b.bookingId, 200);
  assert.equal(b.startTime.toISOString(), START.toISOString());
  assert.deepEqual(b.attendee, { name: "Jane Doe", email: "jane@example.com", timeZone: "America/Los_Angeles" });
  assert.equal(b.meetingUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(b.formPhone, null);
  assert.equal(b.rescheduleUid, null);
});

test("parseBooking finds a phone wherever Cal.com puts it", () => {
  const withQuestion = createdBody({ responses: { attendeePhoneNumber: { label: "phone_number", value: "+1 (415) 555-0123" } } });
  assert.equal(parseBooking(withQuestion).formPhone, "+14155550123");
  const asLocation = createdBody({ responses: { location: { value: "phone", optionValue: "+14155550199" } } });
  assert.equal(parseBooking(asLocation).formPhone, "+14155550199");
  const custom = createdBody({ responses: { mobile_number: "4155550111" } });
  assert.equal(parseBooking(custom).formPhone, "+14155550111");
  const hiddenEmpty = createdBody({ responses: { attendeePhoneNumber: { label: "phone_number", isHidden: true } } });
  assert.equal(parseBooking(hiddenEmpty).formPhone, null);
});

test("parseBooking: reschedule carries the old uid; junk is null", () => {
  const body = createdBody({ uid: "new1", rescheduleUid: "abc123" });
  body.triggerEvent = "BOOKING_RESCHEDULED";
  const b = parseBooking(body);
  assert.equal(b.uid, "new1");
  assert.equal(b.rescheduleUid, "abc123");
  assert.equal(parseBooking({ triggerEvent: "PING" }), null);
  assert.equal(parseBooking(null), null);
});

test("planReminders: 30 minutes before by default", () => {
  const plan = planReminders(START, new Date(START.getTime() - min(24 * 60)), [30]);
  assert.deepEqual(plan, [{ minutesBefore: 30, sendAt: new Date(START.getTime() - min(30)) }]);
});

test("planReminders: booked 20 minutes ahead -> sent now; 3 minutes ahead -> none", () => {
  const now = new Date(START.getTime() - min(20));
  assert.deepEqual(planReminders(START, now, [30]), [{ minutesBefore: 30, sendAt: now }]);
  assert.deepEqual(planReminders(START, new Date(START.getTime() - min(3)), [30]), []);
});

test("planReminders: offsets that both fall in the past collapse to one", () => {
  const now = new Date(START.getTime() - min(20));
  assert.equal(planReminders(START, now, [1440, 30]).length, 1);
  const early = new Date(START.getTime() - min(2 * 24 * 60));
  assert.equal(planReminders(START, early, [1440, 30]).length, 2);
});

test("reminderMinutes reads the env list, default 30", () => {
  assert.deepEqual(reminderMinutes(undefined), [30]);
  assert.deepEqual(reminderMinutes("30, 1440,abc,30"), [1440, 30]);
  assert.deepEqual(reminderMinutes("0,-5"), [30]);
});

test("reminderEvents: walkthrough + 15min by default, env overrides, case-insensitive", () => {
  assert.deepEqual([...reminderEvents("")], ["walkthrough", "15min"]);
  assert.deepEqual([...reminderEvents(" Walkthrough , ")], ["walkthrough"]);
  assert.equal(isReminderEvent("15min", reminderEvents("")), true);
  assert.equal(isReminderEvent("partners-program-walkthrough", reminderEvents("")), false);
  assert.equal(isReminderEvent("", reminderEvents("")), false);
  assert.equal(parseBooking(createdBody()).eventSlug, "walkthrough");
});

test("isTooLate within 5 minutes of the call", () => {
  assert.equal(isTooLate(START, new Date(START.getTime() - min(6))), false);
  assert.equal(isTooLate(START, new Date(START.getTime() - min(5))), true);
  assert.equal(isTooLate(null), true);
});

test("reminderText: name, local time, Meet link, reschedule link", () => {
  const text = reminderText({
    name: "Jane Doe",
    startTime: START,
    timeZone: "America/Los_Angeles",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    uid: "abc123",
    now: new Date(START.getTime() - min(30) + 40_000), // the sweep ran 40s late
  });
  assert.equal(
    text,
    "Hi Jane, it's Maya from Vihara. Reminder: your call with a Vihara advisor starts in 30 minutes, at 3:00 PM PST today.\n" +
      "Join here: https://meet.google.com/abc-defg-hij\n" +
      "Need another time? https://cal.com/reschedule/abc123"
  );
});

test("reminderText: no name, no link, timezone from the area code", () => {
  const text = reminderText({ name: "", startTime: START, timeZone: "", phoneE164: "+12125550123", meetingUrl: "", uid: "x", now: new Date(START.getTime() - min(30)) });
  assert.match(text, /^Hi, it's Maya from Vihara\./);
  assert.match(text, /at 6:00 PM EST today\./);
  assert.match(text, /The video link is in your calendar invite\./);
});
