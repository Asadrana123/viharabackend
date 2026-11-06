// The booking handler and the reminder sweep, against an in-memory stand-in for calBookingModel.
const test = require("node:test");
const assert = require("node:assert/strict");

console.log = console.warn = () => {};

const CalBooking = require("../../model/calcom/calBookingModel");
const { handleCalWebhook } = require("./calcomBookingService");
const { sendDueReminders } = require("./calcomReminderScheduler");

// ---- a tiny fake of the few Mongo calls these files make ----
let rows = [];
const chain = (value) => ({ select: () => chain(value), sort: () => chain(value), limit: () => chain(value), lean: async () => value });
const matches = (row, filter) =>
  Object.entries(filter).every(([k, v]) => {
    if (k === "reminders") return (row.reminders || []).some((r) => r.status === v.$elemMatch.status && r.sendAt <= v.$elemMatch.sendAt.$lte);
    return String(row[k]) === String(v);
  });
CalBooking.findOne = (filter) => chain(rows.find((r) => matches(r, filter)) || null);
CalBooking.find = (filter) => chain(rows.filter((r) => matches(r, filter)).map((r) => structuredClone(r)));
CalBooking.create = async (doc) => {
  if (rows.some((r) => r.uid === doc.uid)) throw Object.assign(new Error("dup"), { code: 11000 });
  const row = { _id: `id-${doc.uid}`, ...structuredClone(doc) };
  rows.push(row);
  return row;
};
CalBooking.updateOne = async (filter, update, opts = {}) => {
  const row = rows.find((r) => matches(r, filter));
  if (!row) {
    if (opts.upsert) rows.push({ ...structuredClone(update.$setOnInsert) });
    return { matchedCount: 0, modifiedCount: 0 };
  }
  let modified = 0;
  // Like Mongo, pick the matching array items first, then apply every field to them.
  const hits = (row.reminders || []).filter((r) =>
    (opts.arrayFilters || []).every((f) => Object.entries(f).every(([fk, fv]) => r[fk.slice(2)] === fv))
  );
  for (const [path, value] of Object.entries(update.$set || {})) {
    const m = /^reminders\.\$\[r\]\.(\w+)$/.exec(path);
    if (!m) {
      row[path] = value;
      modified = 1;
      continue;
    }
    for (const r of hits) {
      r[m[1]] = value;
      modified = 1;
    }
  }
  return { matchedCount: 1, modifiedCount: modified };
};

const START = new Date("2026-11-04T23:00:00Z");
const min = (n) => n * 60_000;
const DAY_BEFORE = new Date(START.getTime() - min(24 * 60));
const body = (event, payload = {}) => ({
  triggerEvent: event,
  payload: {
    uid: "u1",
    type: "walkthrough",
    startTime: START.toISOString(),
    attendees: [{ name: "Jane Doe", email: "jane@example.com", timeZone: "America/Los_Angeles" }],
    metadata: { videoCallUrl: "https://meet.google.com/abc" },
    ...payload,
  },
});
const leadFound = async () => ({ phone: "+14155550123", leadType: "property", leadId: "lead1" });
const noLead = async () => null;

test.beforeEach(() => {
  rows = [];
  process.env.CALCOM_REMINDER_MINUTES = "30";
});

test("created: phone from the lead with the same email, one reminder 30 min before", async () => {
  const r = await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  assert.equal(r.action, "saved");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phoneE164, "+14155550123");
  assert.equal(rows[0].phoneSource, "lead-email");
  assert.deepEqual(rows[0].leadRef, { leadType: "property", leadId: "lead1" });
  assert.equal(rows[0].reminders.length, 1);
  assert.equal(rows[0].reminders[0].sendAt.getTime(), START.getTime() - min(30));
});

test("created: a phone on the booking form wins over the lead lookup", async () => {
  let looked = false;
  await handleCalWebhook(body("BOOKING_CREATED", { responses: { attendeePhoneNumber: { value: "+14155550999" } } }), {
    now: DAY_BEFORE,
    findLeadPhoneByEmail: async () => ((looked = true), null),
  });
  assert.equal(looked, false);
  assert.equal(rows[0].phoneE164, "+14155550999");
  assert.equal(rows[0].phoneSource, "booking-form");
});

test("created: no phone anywhere -> saved without reminders, Slack told", async () => {
  const alerts = [];
  await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: noLead, notify: async (a) => alerts.push(a) });
  assert.equal(rows[0].reminders.length, 0);
  assert.match(rows[0].noPhoneReason, /no lead with this email/);
  assert.equal(alerts.length, 1);
});

test("created twice (Cal.com retry) -> one row", async () => {
  await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  const r = await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  assert.equal(r.action, "exists");
  assert.equal(rows.length, 1);
});

test("rescheduled: old reminders cancelled, new booking gets its own", async () => {
  await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  const later = new Date(START.getTime() + min(120));
  await handleCalWebhook(body("BOOKING_RESCHEDULED", { uid: "u2", rescheduleUid: "u1", startTime: later.toISOString() }), {
    now: DAY_BEFORE,
    findLeadPhoneByEmail: leadFound,
  });
  const [oldRow, newRow] = rows;
  assert.equal(oldRow.status, "rescheduled");
  assert.equal(oldRow.rescheduledToUid, "u2");
  assert.equal(oldRow.reminders[0].status, "cancelled");
  assert.equal(newRow.rescheduledFromUid, "u1");
  assert.equal(newRow.reminders[0].status, "pending");
  assert.equal(newRow.reminders[0].sendAt.getTime(), later.getTime() - min(30));
});

test("cancelled: pending reminders cancelled; a cancel that comes first blocks a late create", async () => {
  await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  await handleCalWebhook(body("BOOKING_CANCELLED"), { now: DAY_BEFORE });
  assert.equal(rows[0].status, "cancelled");
  assert.equal(rows[0].reminders[0].status, "cancelled");

  rows = [];
  await handleCalWebhook(body("BOOKING_CANCELLED"), { now: DAY_BEFORE });
  const r = await handleCalWebhook(body("BOOKING_CREATED"), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  assert.equal(r.action, "exists");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "cancelled");
});

test("only walkthrough and 15min get reminders; other events are not saved", async () => {
  const q = await handleCalWebhook(body("BOOKING_CREATED", { uid: "q1", type: "15min" }), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
  assert.equal(q.action, "saved");
  for (const type of ["partners-program-walkthrough", "secret", ""]) {
    const r = await handleCalWebhook(body("BOOKING_CREATED", { uid: `x-${type}`, type }), { now: DAY_BEFORE, findLeadPhoneByEmail: leadFound });
    assert.equal(r.action, "ignored-event");
  }
  assert.equal((await handleCalWebhook(body("BOOKING_CANCELLED", { uid: "x2", type: "secret" }), { now: DAY_BEFORE })).action, "ignored-event");
  assert.deepEqual(rows.map((r) => r.uid), ["q1"]);
});

test("ignored events and junk don't throw", async () => {
  assert.equal((await handleCalWebhook({ triggerEvent: "PING" })).action, "ignored");
  assert.equal((await handleCalWebhook(body("MEETING_ENDED"))).action, "ignored");
  assert.equal(rows.length, 0);
});

// ---- the sweep ----
async function bookedRow(now = DAY_BEFORE) {
  await handleCalWebhook(body("BOOKING_CREATED"), { now, findLeadPhoneByEmail: leadFound });
  return rows[0];
}

test("sweep: nothing before it is due; at 30 min before it is handed to Vtext once", async () => {
  await bookedRow();
  const sends = [];
  const send = async (m) => (sends.push(m), { message: { _id: "msg1" }, blocked: false });

  await sendDueReminders({ now: new Date(START.getTime() - min(31)), enqueueOutbound: send, force: true });
  assert.equal(sends.length, 0);

  const counts = await sendDueReminders({ now: new Date(START.getTime() - min(30)), enqueueOutbound: send, force: true });
  assert.deepEqual(counts, { queued: 1 });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, "+14155550123");
  assert.equal(sends[0].idempotencyKey, "calcom-reminder-u1-30");
  assert.equal(sends[0].origin.templateKey, "calcom-reminder-30");
  assert.equal(sends[0].origin.leadRef.leadId, "lead1");
  assert.match(sends[0].body, /starts in 30 minutes, at 3:00 PM PST today/);
  assert.equal(rows[0].reminders[0].status, "queued");
  assert.equal(rows[0].reminders[0].messageId, "msg1");

  await sendDueReminders({ now: new Date(START.getTime() - min(29)), enqueueOutbound: send, force: true });
  assert.equal(sends.length, 1);
});

test("sweep: blocked by consent -> recorded as blocked", async () => {
  await bookedRow();
  await sendDueReminders({
    now: new Date(START.getTime() - min(30)),
    enqueueOutbound: async () => ({ message: { _id: "m" }, blocked: true, reason: "no consent on file" }),
    force: true,
  });
  assert.equal(rows[0].reminders[0].status, "blocked");
  assert.match(rows[0].reminders[0].reason, /no consent/);
});

test("sweep: too close to the call -> skipped, not sent", async () => {
  await bookedRow();
  let sent = 0;
  await sendDueReminders({ now: new Date(START.getTime() - min(4)), enqueueOutbound: async () => (sent++, {}), force: true });
  assert.equal(sent, 0);
  assert.equal(rows[0].reminders[0].status, "skipped");
});

test("sweep: an error puts it back to retry next minute", async () => {
  await bookedRow();
  await sendDueReminders({ now: new Date(START.getTime() - min(30)), enqueueOutbound: async () => { throw new Error("redis down"); }, force: true });
  assert.equal(rows[0].reminders[0].status, "pending");
  await sendDueReminders({ now: new Date(START.getTime() - min(29)), enqueueOutbound: async () => ({ message: { _id: "m2" } }), force: true });
  assert.equal(rows[0].reminders[0].status, "queued");
});

test("sweep: two reminders overdue at once -> only the later one is sent", async () => {
  process.env.CALCOM_REMINDER_MINUTES = "1440,30";
  await bookedRow(new Date(START.getTime() - min(3 * 24 * 60)));
  const sends = [];
  await sendDueReminders({ now: new Date(START.getTime() - min(30)), enqueueOutbound: async (m) => (sends.push(m), { message: { _id: "m" } }), force: true });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].idempotencyKey, "calcom-reminder-u1-30");
  const byMin = Object.fromEntries(rows[0].reminders.map((r) => [r.minutesBefore, r.status]));
  assert.deepEqual(byMin, { 1440: "skipped", 30: "queued" });
});

test("sweep: off unless enabled", async () => {
  await bookedRow();
  delete process.env.CALCOM_REMINDERS_ENABLED;
  let sent = 0;
  await sendDueReminders({ now: new Date(START.getTime() - min(30)), enqueueOutbound: async () => (sent++, {}) });
  assert.equal(sent, 0);
});
