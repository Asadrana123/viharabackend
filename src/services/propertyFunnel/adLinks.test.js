// Funnel Ad Links (step 6): what the form may send.
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanPropertyIds, cleanAwareness, InputError } = require("./adLinksService");

test("property ids: trimmed, lowercased, unique; bad input refused", () => {
  assert.deepEqual(cleanPropertyIds([" 401-Rensselaer-Ave-Ogdensburg ", "401-rensselaer-ave-ogdensburg", "", "1983-law-st-new-orleans"]),
    ["401-rensselaer-ave-ogdensburg", "1983-law-st-new-orleans"]);
  assert.deepEqual(cleanPropertyIds([]), []);
  assert.throws(() => cleanPropertyIds("401-rensselaer-ave-ogdensburg"), InputError);
  assert.throws(() => cleanPropertyIds([{ $ne: 1 }]), InputError);
  assert.throws(() => cleanPropertyIds(["../etc"]), InputError);
  assert.throws(() => cleanPropertyIds(Array.from({ length: 21 }, (_, i) => `p-${i}`)), InputError);
});

test("awareness: Cold, Warm, Hot, or empty for the automatic guess", () => {
  assert.equal(cleanAwareness("Warm"), "Warm");
  assert.equal(cleanAwareness(null), null);
  assert.equal(cleanAwareness(""), null);
  assert.throws(() => cleanAwareness("warm"), InputError);
  assert.throws(() => cleanAwareness({ $set: 1 }), InputError);
});
