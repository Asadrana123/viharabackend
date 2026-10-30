const test = require("node:test");
const assert = require("node:assert/strict");
const { maskEmail, maskPhone } = require("./maskPii");

test("emails keep the first letter and the domain", () => {
  assert.equal(maskEmail("jane.doe@gmail.com"), "j***@gmail.com");
  assert.equal(maskEmail("  A@vihara.ai "), "A***@vihara.ai");
  assert.equal(maskEmail("weird@name@example.test"), "w***@example.test");
  assert.equal(maskEmail("not-an-email"), "***");
  assert.equal(maskEmail("@example.test"), "***");
});

test("phones keep the last 4 digits", () => {
  assert.equal(maskPhone("+15551234567"), "***4567");
  assert.equal(maskPhone("+1 (555) 123-4567"), "***4567");
  assert.equal(maskPhone(5551234567), "***4567");
  assert.equal(maskPhone("12"), "***");
});

test("missing values stay missing, so log lines read the same as before", () => {
  for (const v of [undefined, null, ""]) {
    assert.equal(maskEmail(v), v);
    assert.equal(maskPhone(v), v);
  }
});
