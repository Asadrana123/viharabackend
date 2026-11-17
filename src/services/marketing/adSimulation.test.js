const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("./adSimulationModel");

const WINDOW = { since: "2026-08-19", until: "2026-11-16" };

/** A timeline row like Zernio's /v1/ads/timeline. */
const row = (date, spend, impressions, clicks, leads) => ({
    date,
    spend,
    impressions,
    clicks: clicks * 2, // all clicks; the model must use link clicks
    actions: { link_click: clicks, lead: leads },
});

const isoDay = (i) => new Date(Date.UTC(2026, 7, 19 + i)).toISOString().slice(0, 10);

/** `count` days from Aug 19, each from make(i). */
const days = (count, make) => Array.from({ length: count }, (_, i) => make(i, isoDay(i)));

test("a day is read as spend, impressions, link clicks and Meta leads", () => {
    assert.deepEqual(sim.dayNumbers(row("2026-11-01", 100, 1500, 40, 3)), {
        date: "2026-11-01",
        spend: 100,
        impressions: 1500,
        clicks: 40,
        leads: 3,
    });
    // Form + website leads add up when Meta sends no "lead" total.
    const split = sim.dayNumbers({ date: "2026-11-01", spend: 10, impressions: 1, actions: { "onsite_conversion.lead_grouped": 2, "offsite_conversion.fb_pixel_lead": 1 } });
    assert.equal(split.leads, 3);
});

test("percentile interpolates between neighbours", () => {
    assert.equal(sim.percentile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(sim.percentile([0, 10], 0.1), 1);
    assert.equal(sim.percentile([], 0.5), null);
});

test("steady ads give the same per-dollar rate with no spread", () => {
    // $100 a day -> 1,500 impressions, 40 clicks, 2 leads, every day for 90 days.
    const out = sim.buildSimulationBasis(days(90, (i, d) => row(d, 100, 1500, 40, 2)), WINDOW);
    assert.equal(out.available, true);
    assert.equal(out.basis.kind, "recent");
    assert.equal(out.basis.runningDays, 28);
    assert.equal(out.basis.cpm, 66.67);
    assert.equal(out.basis.costPerLead, 50);
    assert.deepEqual(out.perDollar.impressions, { expected: 15, low: 15, high: 15 });
    assert.deepEqual(out.perDollar.leads, { expected: 0.02, low: 0.02, high: 0.02 });
    assert.equal(out.backtest.summary.impressions.medianErrorPct, 0);
    // 90 running days: weeks counted back from the end, each with >= 14 days before it.
    assert.equal(out.backtest.weeks.length, 10);
    assert.equal(out.backtest.weeks.at(-1).until, "2026-11-16");
    assert.equal(out.history.maxDaySpend, 100);
});

test("the guess uses the last 28 days, the range comes from past misses", () => {
    // Impressions per dollar drift from 10 to 20 over the 90 days.
    const out = sim.buildSimulationBasis(days(90, (i, d) => row(d, 100, 1000 + Math.round((1000 * i) / 89), 30, 1)), WINDOW);
    const imp = out.perDollar.impressions;
    // Last 28 days: about 17 to 20 per dollar.
    assert.ok(imp.expected > 18 && imp.expected < 19, `expected ${imp.expected}`);
    // Every past guess was too low (the trend kept rising), so the range only goes up.
    assert.equal(imp.low, imp.expected);
    assert.ok(imp.high > imp.expected);
    for (const w of out.backtest.weeks) assert.ok(w.impressions.actual > w.impressions.predicted);
});

test("each backtest week is guessed only from the days before it", () => {
    // 30 days at 10 impressions per dollar, then a jump to 30 per dollar.
    const rows = days(90, (i, d) => row(d, 100, i < 30 ? 1000 : 3000, 30, 1));
    const out = sim.buildSimulationBasis(rows, WINDOW);
    const firstWeekAfterJump = out.backtest.weeks.find((w) => w.since >= isoDay(30));
    assert.ok(firstWeekAfterJump.impressions.predicted < firstWeekAfterJump.impressions.actual);
    // The weeks long after the jump are guessed right.
    assert.equal(out.backtest.weeks.at(-1).impressions.errorPct, 0);
});

test("days under $5 are left out, and gaps in the dates are fine", () => {
    const rows = days(90, (i, d) => (i % 2 ? row(d, 2, 500, 50, 5) : row(d, 100, 1500, 40, 2)));
    const out = sim.buildSimulationBasis(rows, WINDOW);
    assert.equal(out.history.runningDays, 45);
    assert.equal(out.perDollar.impressions.expected, 15);
    // Rows outside the window are ignored too.
    const outside = sim.buildSimulationBasis([...rows, row("2026-11-17", 1000, 1, 1, 1)], WINDOW);
    assert.equal(outside.history.runningDays, 45);
});

test("leads with no lead in a week give no error for that week, not a crash", () => {
    const out = sim.buildSimulationBasis(days(90, (i, d) => row(d, 100, 1500, 40, i >= 83 ? 0 : 2)), WINDOW);
    assert.equal(out.backtest.weeks.at(-1).leads.actual, 0);
    assert.equal(out.backtest.weeks.at(-1).leads.errorPct, null);
    assert.ok(out.perDollar.leads.low < out.perDollar.leads.expected);
});

test("too little spend says so instead of guessing", () => {
    const out = sim.buildSimulationBasis(days(5, (i, d) => row(d, 10, 100, 2, 0)), WINDOW);
    assert.equal(out.available, false);
    assert.match(out.reason, /Not enough/);
    assert.equal(sim.buildSimulationBasis([], WINDOW).available, false);
    assert.equal(sim.buildSimulationBasis(undefined, WINDOW).available, false);
});

test("a thin recent month falls back to all 90 days", () => {
    // Spend stopped 40 days ago apart from three small days.
    const rows = days(90, (i, d) => (i < 50 ? row(d, 100, 1500, 40, 2) : i > 86 ? row(d, 20, 100, 1, 0) : row(d, 0, 0, 0, 0)));
    const out = sim.buildSimulationBasis(rows, WINDOW);
    assert.equal(out.basis.kind, "all");
    assert.equal(out.basis.runningDays, 53);
});

test("fewer than 4 backtest weeks gives a guess with no range", () => {
    // 35 running days -> 3 weeks, each with 14+ days before it.
    const out = sim.buildSimulationBasis(days(35, (i, d) => row(d, 100, 1500, 40, 2)), WINDOW);
    assert.equal(out.backtest.weeks.length, 3);
    assert.deepEqual(out.perDollar.impressions, { expected: 15, low: null, high: null });
});
