// node --test src/services/calling/nightGuard.test.js
// Owner's rule (Nov 2026): the sign-up call goes out right away at any hour; every LATER automatic call
// (daily follow-ups in every funnel) only rings 9 AM-9 PM in the lead's time zone.
const test = require("node:test");
const assert = require("node:assert/strict");
const { skipUpdate } = require("./followUpCadence");
const { callTimezone } = require("../../utils/areaCodeTimezone");

const LA = "+13105550123"; // 310, Los Angeles
const UNKNOWN = "+18885550123"; // 888, not in the area code table
const lead = (phone, extra = {}) => ({ phoneNormalized: phone, createdAt: new Date("2026-11-17T18:00:00Z"), ...extra });

test("a follow-up due at 1 AM in LA waits until 9 AM LA time", () => {
  const now = new Date("2026-11-18T09:00:00Z"); // 1:00 AM PST
  assert.deepEqual(skipUpdate(lead(LA), "America/Los_Angeles", now), { nextCallAt: new Date("2026-11-18T17:00:00Z") });
});

test("a follow-up due at 10 PM in LA waits until 9 AM the next day", () => {
  const now = new Date("2026-11-19T06:00:00Z"); // 10:00 PM PST on the 18th
  assert.deepEqual(skipUpdate(lead(LA), "America/Los_Angeles", now), { nextCallAt: new Date("2026-11-19T17:00:00Z") });
});

test("a follow-up at 2:30 PM in LA is dialed", () => {
  const now = new Date("2026-11-18T22:30:00Z"); // 2:30 PM PST
  assert.equal(skipUpdate(lead(LA), "America/Los_Angeles", now), null);
});

test("unknown area code: 9 AM Eastern is 6 AM Pacific, so it waits until noon Eastern", () => {
  const now = new Date("2026-11-18T14:00:00Z"); // 9:00 AM EST / 6:00 AM PST
  assert.deepEqual(skipUpdate(lead(UNKNOWN), "America/New_York", now), { nextCallAt: new Date("2026-11-18T17:00:00Z") });
});

test("an India browser zone is ignored for a US number with an unknown area code", () => {
  assert.equal(callTimezone(UNKNOWN, "Asia/Kolkata"), "");
  assert.equal(callTimezone(UNKNOWN, "America/Chicago"), "America/Chicago");
  assert.equal(callTimezone(LA, "Asia/Kolkata"), "America/Los_Angeles");
  assert.equal(callTimezone("+919876543210", "Asia/Kolkata"), "Asia/Kolkata");
});

test("El Paso (915) is Mountain time", () => {
  assert.equal(callTimezone("+19155550123", ""), "America/Denver");
});
