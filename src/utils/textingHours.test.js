const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextTextingTime } = require("./textingHours");

const at = (phone, iso) => nextTextingTime(phone, new Date(iso)).at.toISOString();

test("inside 9 AM to 8 PM in the lead's zone: now", () => {
  const r = nextTextingTime("+12125550123", new Date("2026-11-03T15:00:00Z")); // 10 AM New York
  assert.equal(r.waited, false);
  assert.equal(r.at.toISOString(), "2026-11-03T15:00:00.000Z");
});

test("before 9 AM: 9 AM the same day; at or after 8 PM: 9 AM the next day", () => {
  assert.equal(at("+12125550123", "2026-11-03T12:00:00Z"), "2026-11-03T14:00:00.000Z"); // 7 AM NY -> 9 AM NY
  assert.equal(at("+12125550123", "2026-11-04T01:00:00Z"), "2026-11-04T14:00:00.000Z"); // 8 PM NY -> 9 AM next day
  assert.equal(at("+15045550123", "2026-11-04T02:30:00Z"), "2026-11-04T15:00:00.000Z"); // 8:30 PM New Orleans -> 9 AM Central
});

test("an unknown area code must be inside the hours in both Eastern and Pacific", () => {
  // 10 AM Eastern is 7 AM Pacific -> wait for 9 AM Pacific (noon Eastern).
  assert.equal(at("+19995550123", "2026-11-03T15:00:00Z"), "2026-11-03T17:00:00.000Z");
  // 7 PM Eastern is fine in both.
  assert.equal(nextTextingTime("+19995550123", new Date("2026-11-04T00:00:00Z")).waited, false);
  // 8:30 PM Eastern -> noon Eastern next day.
  assert.equal(at("+19995550123", "2026-11-04T01:30:00Z"), "2026-11-04T17:00:00.000Z");
});
