const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLimits } = require("./vtextLimitsValidation");

test("no limits, or limits with the keys left out, are fine (channel defaults apply)", () => {
  assert.equal(validateLimits(undefined).ok, true);
  assert.equal(validateLimits(null).ok, true);
  assert.equal(validateLimits({}).ok, true);
  assert.equal(validateLimits({ perMinute: null, perDay: undefined }).ok, true);
});

test("good whole numbers pass, and keys we don't check pass through", () => {
  assert.equal(validateLimits({ perMinute: 3, perDay: 100, newRecipientsPerHour: 15 }).ok, true);
  assert.equal(validateLimits({ perDay: 50, replyReservePct: 10, jitterMs: { min: 1, max: 2 } }).ok, true);
});

test("zero, negatives, decimals and strings are rejected with a message naming the field", () => {
  for (const bad of [0, -1, 2.5, "5", NaN]) {
    const result = validateLimits({ perMinute: bad });
    assert.equal(result.ok, false, `perMinute ${String(bad)}`);
    assert.match(result.errors[0], /Per minute/);
  }
});

test("a value far above what a line can do is rejected", () => {
  assert.equal(validateLimits({ perMinute: 61 }).ok, false);
  assert.equal(validateLimits({ perDay: 5001 }).ok, false);
  assert.equal(validateLimits({ newRecipientsPerHour: 1001 }).ok, false);
  assert.equal(validateLimits({ perMinute: 60, perDay: 5000, newRecipientsPerHour: 1000 }).ok, true);
});

test("every problem is reported, and a non-object is rejected", () => {
  assert.equal(validateLimits({ perMinute: 0, perDay: 0 }).errors.length, 2);
  assert.equal(validateLimits("100").ok, false);
  assert.equal(validateLimits([1]).ok, false);
});
