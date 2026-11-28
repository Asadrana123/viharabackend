// Call number checks (branch call-number-checks, 2026-11-28): no calls to a number that can't exist, that Twilio
// says doesn't exist, or whose calls never connect; and the call lists stop for a bad number instead of booking
// tomorrow's call, without counting calls that never went out.
// Throwaway local Mongo; the DB tests are skipped when no local Mongo is running.
// No real call can go out: axios is stubbed before vapiService loads, and every number dialed here is refused first.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const axios = require("axios");
const vapiRequests = [];
axios.post = async (url) => { vapiRequests.push(url); throw new Error("test: no real calls"); };
axios.get = async (url) => { vapiRequests.push(url); throw new Error("test: no real calls"); };
process.env.OUTBOUND_DISABLED = "false"; // reach the number check (it runs after the outbound switch)
process.env.FACETIME_ENABLED = "false";

const PhoneDial = require("../../model/calling/phoneDialModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { checkCallNumber, recordCallEnded, settleNotDialed, DEAD_AFTER_FAILED_CONNECTS } = require("./callNumberCheck");
const { dispatchCall } = require("./vapiService");
const { runCallBurst } = require("./registrationCallService");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_call_number_check_test";
const DAY = 86_400_000;
let mongoUp = false;
let counter = 0;

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
  }
});

test.after(async () => {
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test.afterEach(() => {
  assert.deepEqual(vapiRequests, [], "nothing may reach Vapi");
});

// Real-range San Francisco numbers, so the free check passes.
const nextNumber = () => `+1415523${String(2000 + ++counter)}`;

test("a number that can't exist is refused before any database or Vapi call", async () => {
  for (const n of ["+14989977708", "+15555555555", "+11234567890", "4989977708", "", "abc"]) {
    const r = await checkCallNumber(n);
    assert.equal(r.ok, false, n);
    assert.equal(r.reason, "not-a-real-number");
  }
});

test("a real number is fine, including a landline (only texts can't reach one)", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const landline = nextNumber();
  await VtextContact.create({ phoneE164: landline, phoneStatus: "landline", source: "admin" });
  assert.deepEqual(await checkCallNumber(landline), { ok: true });
  assert.deepEqual(await checkCallNumber(nextNumber()), { ok: true });
});

test("a number Twilio said doesn't exist (texts failed 21211 / 30005) is not called", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextNumber();
  await VtextContact.create({ phoneE164: phone, phoneStatus: "invalid", source: "admin" });
  const r = await checkCallNumber(phone);
  assert.equal(r.reason, "number-does-not-exist");
});

test("3 calls in a row that never connect mark the number dead for 30 days", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextNumber();
  const key = phone.slice(1);
  await PhoneDial.create({ phone: key, lastDialAt: new Date() });

  for (let i = 1; i < DEAD_AFTER_FAILED_CONNECTS; i += 1) {
    assert.equal(await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: `c${i}` }), "counted");
  }
  assert.deepEqual(await checkCallNumber(phone), { ok: true }, "2 in a row: still called");
  assert.equal(await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: "c3" }), "dead");
  assert.equal((await checkCallNumber(phone)).reason, "dead-number");

  const later = new Date(Date.now() + 31 * DAY);
  assert.deepEqual(await checkCallNumber(phone, { now: later }), { ok: true }, "after 30 days it may be tried again");
});

test("a call that rings (voicemail, busy, answered) resets the count", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextNumber();
  await PhoneDial.create({ phone: phone.slice(1), lastDialAt: new Date() });
  await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: "a1" });
  await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: "a2" });
  assert.equal(await recordCallEnded({ phone, endedReason: "voicemail", vapiCallId: "a3" }), "reset");
  await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: "a4" });
  const row = await PhoneDial.findOne({ phone: phone.slice(1) }).lean();
  assert.equal(row.failedConnects, 1, "not 3: the voicemail in between proved the line is alive");
  assert.equal(row.deadUntil, null);
});

test("the same call reported twice is counted once; our own errors don't count", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextNumber();
  await PhoneDial.create({ phone: phone.slice(1), lastDialAt: new Date() });
  await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: "dup" });
  assert.equal(await recordCallEnded({ phone, endedReason: "twilio-failed-to-connect-call", vapiCallId: "dup" }), null);
  assert.equal(await recordCallEnded({ phone, endedReason: "pipeline-error", vapiCallId: "x" }), null);
  assert.equal((await PhoneDial.findOne({ phone: phone.slice(1) }).lean()).failedConnects, 1);
});

test("dispatchCall refuses a bad number with badNumber, before Vapi", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const res = await dispatchCall("+14989977708", { fullName: "Gary S" }, { source: "test" });
  assert.equal(res.success, false);
  assert.equal(res.badNumber, true);
  assert.equal(res.badNumberReason, "not-a-real-number");
  assert.match(res.error, /not a real phone number/);
  assert.equal(await PhoneDial.findOne({ phone: "14989977708" }), null, "not recorded as today's dial");
});

test("a burst to a bad number reports notDialed + badNumber", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const result = await runCallBurst({ fullName: "Gary S", phone: "+14989977708" });
  assert.equal(result.connected, false);
  assert.equal(result.notDialed, true);
  assert.equal(result.badNumber, true);
});

const newLead = (fields = {}) => {
  const phone = nextNumber();
  return PropertyLead.create({
    fullName: "Test Lead", email: `t${++counter}@example.test`, phone, phoneNormalized: phone, propertySlug: "test-slug",
    consent: true, callStatus: "no-answer", callAttempts: 3, nextCallAt: new Date(Date.now() + DAY), ...fields,
  });
};

test("a list stops calling a lead with a bad number, and the attempt isn't counted", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const lead = await newLead();
  const stopped = await settleNotDialed(PropertyLead, lead._id, { connected: false, notDialed: true, badNumber: true, error: "bad number: not a real phone number" });
  assert.equal(stopped, true);
  const after = await PropertyLead.findById(lead._id).lean();
  assert.equal(after.callStatus, "not-reached");
  assert.equal(after.nextCallAt, null);
  assert.equal(after.callAttempts, 2);
});

test("a call that didn't go out for another reason isn't counted, and the list carries on", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const lead = await newLead();
  assert.equal(await settleNotDialed(PropertyLead, lead._id, { connected: false, notDialed: true, error: "already called today" }), false);
  assert.equal((await PropertyLead.findById(lead._id).lean()).callAttempts, 2);
  assert.equal(await settleNotDialed(PropertyLead, lead._id, { connected: false, suppressed: true }), false);
  assert.equal((await PropertyLead.findById(lead._id).lean()).callAttempts, 1);

  const toorakStyle = await newLead();
  await settleNotDialed(PropertyLead, toorakStyle._id, { connected: false, notDialed: true }, { undoAttempt: false });
  assert.equal((await PropertyLead.findById(toorakStyle._id).lean()).callAttempts, 3, "Toorak keeps its count");
});

test("a call that went out is left to the list as before", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const lead = await newLead();
  assert.equal(await settleNotDialed(PropertyLead, lead._id, { connected: false }), false);
  assert.equal(await settleNotDialed(PropertyLead, lead._id, { connected: true }), false);
  const after = await PropertyLead.findById(lead._id).lean();
  assert.equal(after.callAttempts, 3);
  assert.equal(after.callStatus, "no-answer");
});

test("the attempt count never goes below zero", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const lead = await newLead({ callAttempts: 0 });
  await settleNotDialed(PropertyLead, lead._id, { connected: false, notDialed: true, badNumber: true });
  assert.equal((await PropertyLead.findById(lead._id).lean()).callAttempts, 0);
});
