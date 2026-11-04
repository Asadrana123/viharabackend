const test = require("node:test");
const assert = require("node:assert/strict");
const { decideDailyReport, notForSaleKey } = require("./statusReportRules");

const p = (id) => ({ _id: id });
const forSale = (id) => ({ product: p(id), status: "FOR_SALE" });
const kept = (id, status = "PENDING") => ({ product: p(id), status, open: false });
const open = (id, status = "OTHER") => ({ product: p(id), status, open: true });
const failed = (id, status = "FOR_SALE") => ({ product: p(id), status, error: "No listing status found on the page" });

// A Wednesday and a Monday, 5 AM Pacific.
const WED = new Date("2026-11-04T13:00:00Z");
const MON = new Date("2026-11-09T13:00:00Z");

/** Runs the rules the way the service saves state, day after day. */
function replay(days) {
    let state = null;
    return days.map(({ rows, now }) => {
        const d = decideDailyReport({ rows, state, now });
        const stillFailing = (state?.postedFailedIds || []).filter((id) => d.failed.includes(id));
        state = {
            notForSaleKey: d.post ? d.key : state?.notForSaleKey ?? "",
            lastFailedIds: d.failed,
            postedFailedIds: d.post ? d.repeatedFailures : stillFailing,
        };
        return d.post ? d.reason : "quiet";
    });
}

test("the last five days in #property-status: two posts instead of five", () => {
    // Oct 30 to Nov 3 as posted in Slack: Sallander pending/kept and failing every day,
    // S Prieur off market with an open alert, a passing Firecrawl error on two days.
    const base = [kept("sallander"), open("prieur"), forSale("a"), forSale("b")];
    const day = (extra) => ({ rows: [...base.filter((r) => !extra.some((e) => idOf(e) === idOf(r))), ...extra], now: WED });
    const idOf = (r) => r.product._id;
    const sallanderFails = { ...failed("sallander", "PENDING"), open: false };
    assert.deepEqual(
        replay([
            day([sallanderFails, failed("a")]), // Oct 30: first run
            day([sallanderFails]), // Oct 31: Sallander failed 2 days in a row
            day([sallanderFails]), // Nov 1: same as before
            day([sallanderFails]), // Nov 2: same as before
            day([sallanderFails, failed("b")]), // Nov 3: one passing failure
        ]),
        ["first run", "failed two days in a row", "quiet", "quiet", "quiet"]
    );
});

test("a new alert always posts the summary", () => {
    const state = { notForSaleKey: notForSaleKey([kept("x")]), lastFailedIds: [], postedFailedIds: [] };
    const d = decideDailyReport({ rows: [kept("x"), { product: p("y"), status: "RECENTLY_SOLD", alerted: true }], state, now: WED });
    assert.equal(d.reason, "new alert");
});

test("the next day, the new alert (still open) does not post again", () => {
    const day1 = [kept("x"), { product: p("y"), status: "RECENTLY_SOLD", alerted: true }];
    const day2 = [kept("x"), { product: p("y"), status: "RECENTLY_SOLD", open: true }];
    assert.equal(notForSaleKey(day1), notForSaleKey(day2));
});

test("Keep live pressed (open -> kept) posts", () => {
    const state = { notForSaleKey: notForSaleKey([open("x")]), lastFailedIds: [], postedFailedIds: [] };
    assert.equal(decideDailyReport({ rows: [kept("x", "OTHER")], state, now: WED }).reason, "not-for-sale list changed");
});

test("a property back on sale or hidden posts", () => {
    const state = { notForSaleKey: notForSaleKey([kept("x")]), lastFailedIds: [], postedFailedIds: [] };
    assert.equal(decideDailyReport({ rows: [forSale("x")], state, now: WED }).reason, "not-for-sale list changed");
    assert.equal(decideDailyReport({ rows: [], state, now: WED }).reason, "not-for-sale list changed");
});

test("one failed check is quiet, the second in a row posts once", () => {
    const state = { notForSaleKey: "", lastFailedIds: [], postedFailedIds: [] };
    assert.equal(decideDailyReport({ rows: [failed("x")], state, now: WED }).post, false);
    const again = { ...state, lastFailedIds: ["x"] };
    assert.equal(decideDailyReport({ rows: [failed("x")], state: again, now: WED }).reason, "failed two days in a row");
    const posted = { ...again, postedFailedIds: ["x"] };
    assert.equal(decideDailyReport({ rows: [failed("x")], state: posted, now: WED }).post, false);
});

test("a property that recovered and fails twice again is posted again", () => {
    assert.deepEqual(
        replay([
            { rows: [failed("x")], now: WED }, // first run
            { rows: [failed("x")], now: WED }, // twice: posted
            { rows: [forSale("x")], now: WED }, // fine again
            { rows: [failed("x")], now: WED }, // once
            { rows: [failed("x")], now: WED }, // twice again: posted
        ]),
        ["first run", "failed two days in a row", "quiet", "quiet", "failed two days in a row"]
    );
});

test("Monday always posts the full summary", () => {
    const state = { notForSaleKey: "", lastFailedIds: [], postedFailedIds: [] };
    assert.equal(decideDailyReport({ rows: [forSale("x")], state, now: WED }).post, false);
    assert.equal(decideDailyReport({ rows: [forSale("x")], state, now: MON }).reason, "weekly summary");
});

test("a run by hand always posts", () => {
    const state = { notForSaleKey: "", lastFailedIds: [], postedFailedIds: [] };
    assert.equal(decideDailyReport({ rows: [forSale("x")], state, force: true, now: WED }).reason, "run by hand");
});
