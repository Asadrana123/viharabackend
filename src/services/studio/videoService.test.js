const test = require("node:test");
const assert = require("node:assert/strict");
const { keyMatches, cleanVideo, cleanBatch, cleanFeedback, undelivered } = require("./videoService");

const job = (over = {}) => ({
  coreId: "AT1405-V01",
  name: "CR-AT1405-V01",
  propertyId: "1405-tamarack-ave-atwater",
  videoId: "v01",
  stage: "CR",
  round: 0,
  status: "ready_for_review",
  gates: { plan: { state: "approved", by: "Preetham" }, clips: { total: 4, approved: 3 }, cut: { state: "pending" } },
  durationSeconds: 28.4,
  lastBuildAt: "2026-10-30T10:00:00Z",
  ...over,
});

test("the shared key must match, and an unset key refuses everyone", () => {
  assert.equal(keyMatches("secret", "secret"), true);
  assert.equal(keyMatches("secret", "secrex"), false);
  assert.equal(keyMatches("secret", ""), false);
  assert.equal(keyMatches("secret", undefined), false);
  assert.equal(keyMatches("", ""), false);
  assert.equal(keyMatches(undefined, "anything"), false);
});

test("keeps a job's summary and nothing else", () => {
  const v = cleanVideo({ ...job(), feedback: [{ text: "planted" }], other: "x" });
  assert.equal(v.coreId, "AT1405-V01");
  assert.deepEqual(v.gates.clips, { total: 4, approved: 3 });
  assert.deepEqual(v.gates.cut, { state: "pending", by: null });
  assert.equal("feedback" in v, false);
  assert.equal("other" in v, false);
});

test("refuses a summary it cannot read", () => {
  assert.throws(() => cleanVideo(job({ coreId: "../etc" })), /not a core id/);
  assert.throws(() => cleanVideo(job({ status: "live" })), /unknown status/);
  assert.throws(() => cleanVideo(job({ gates: { plan: { state: "maybe" } } })), /Unknown gate state/);
  assert.throws(() => cleanVideo(job({ gates: { clips: { total: 1, approved: 2 } } })), /more clips approved/);
  assert.throws(() => cleanVideo(job({ lastBuildAt: "not a date" })), /bad build date/);
});

test("one bad row refuses the whole push", () => {
  assert.throws(() => cleanBatch([job(), job({ status: "live" })]), /unknown status/);
  assert.throws(() => cleanBatch([job(), job()]), /appears twice/);
  assert.throws(() => cleanBatch("x"), /as a list/);
  assert.equal(cleanBatch([]).length, 0);
});

test("feedback is kept as typed", () => {
  assert.equal(cleanFeedback("  0:14 pe  pan fast hai\nthoda slow karo  "), "0:14 pe  pan fast hai\nthoda slow karo");
  assert.throws(() => cleanFeedback("   "), /Write the feedback/);
  assert.throws(() => cleanFeedback("x".repeat(4001)), /at most/);
});

test("hands over only what has not been delivered, oldest first", () => {
  const rows = undelivered([
    { coreId: "A", feedback: [{ _id: 1, text: "new", byName: "Dinesh", at: new Date("2026-10-31T10:00:00Z"), deliveredAt: null }, { _id: 2, text: "old", byName: "Dinesh", at: new Date("2026-10-30T10:00:00Z"), deliveredAt: new Date() }] },
    { coreId: "B", feedback: [{ _id: 3, text: "first", byName: "Preetham", at: new Date("2026-10-30T09:00:00Z"), deliveredAt: null }] },
  ]);
  assert.deepEqual(rows.map((r) => [r.coreId, r.text]), [["B", "first"], ["A", "new"]]);
});
