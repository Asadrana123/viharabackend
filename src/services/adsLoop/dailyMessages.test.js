const test = require("node:test");
const assert = require("node:assert/strict");
const { pullAlertText, unmatchedIds, heartbeatText } = require("./dailyMessages");

const ad = (id, name = `Ad ${id}`, status = "active") => ({ platformAdId: id, name, status });
const none = { unmatched: [], unapproved: [], unknown: [] };

test("pull: first post lists every unmatched ad", () => {
    const text = pullAlertText({ ...none, unmatched: [ad("1"), ad("2")], previousUnmatchedIds: null });
    assert.match(text, /Unmatched ads\*: 2 Meta ads have no AP- name/);
    assert.match(text, /Ad 1/);
    assert.match(text, /Ad 2/);
});

test("pull: the same list as last time posts nothing", () => {
    assert.equal(pullAlertText({ ...none, unmatched: [ad("1"), ad("2")], previousUnmatchedIds: ["1", "2"] }), null);
});

test("pull: fewer unmatched ads than last time posts nothing", () => {
    assert.equal(pullAlertText({ ...none, unmatched: [ad("1")], previousUnmatchedIds: ["1", "2"] }), null);
});

test("pull: only the new ads are listed, with the total", () => {
    const text = pullAlertText({ ...none, unmatched: [ad("1"), ad("2"), ad("3")], previousUnmatchedIds: ["1", "2"] });
    assert.match(text, /1 new unmatched ad\*\. 3 Meta ads have no AP- name/);
    assert.match(text, /Ad 3/);
    assert.doesNotMatch(text, /Ad 1\b/);
});

test("pull: a manual pull lists everything even when nothing changed", () => {
    const text = pullAlertText({ ...none, unmatched: [ad("1"), ad("2")], previousUnmatchedIds: ["1", "2"], force: true });
    assert.match(text, /Ad 1/);
    assert.match(text, /Ad 2/);
});

test("pull: long lists stop at 20 and say how many more", () => {
    const many = Array.from({ length: 25 }, (_, i) => ad(String(i)));
    assert.match(pullAlertText({ ...none, unmatched: many, previousUnmatchedIds: null }), /… and 5 more/);
});

test("pull: hand-launched ads and unknown core ids are always posted, in the same message", () => {
    const text = pullAlertText({
        unmatched: [ad("1")],
        unapproved: [ad("9", "CR-BB449-S01_x")],
        unknown: ["ZZ1-S01"],
        previousUnmatchedIds: ["1"],
    });
    assert.doesNotMatch(text, /Unmatched/);
    assert.match(text, /1 running ad is not named AP-/);
    assert.match(text, /ZZ1-S01/);
});

test("pull: nothing at all posts nothing", () => {
    assert.equal(pullAlertText({ ...none, previousUnmatchedIds: null }), null);
});

test("unmatchedIds keeps the ad ids as strings", () => {
    assert.deepEqual(unmatchedIds([ad(52666680007524), ad("2")]), ["52666680007524", "2"]);
});

const now = new Date("2026-11-04T01:00:00Z"); // 06:30 IST
const fresh = { lastPullAt: new Date("2026-11-04T00:30:00Z"), lastPullSummary: "ok", killSwitch: { on: false } };

test("heartbeat: all fine posts nothing", () => {
    assert.equal(heartbeatText({ state: fresh, missing: [], now }), null);
});

test("heartbeat: kill switch on is posted", () => {
    assert.match(heartbeatText({ state: { ...fresh, killSwitch: { on: true } }, missing: [], now }), /Kill switch is ON/);
});

test("heartbeat: missing settings are posted", () => {
    assert.match(heartbeatText({ state: fresh, missing: ["ZERNIO_API_KEY"], now }), /Missing settings: ZERNIO_API_KEY/);
});

test("heartbeat: a pull older than 12 hours is posted", () => {
    const state = { ...fresh, lastPullAt: new Date("2026-11-03T00:30:00Z") };
    assert.match(heartbeatText({ state, missing: [], now }), /No daily pull since 2026-11-03/);
});

test("heartbeat: a pull that never ran is posted", () => {
    assert.match(heartbeatText({ state: { killSwitch: {} }, missing: [], now }), /never finished/);
});
