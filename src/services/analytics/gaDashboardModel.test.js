const test = require("node:test");
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");
const { rangeWindows, buildDashboardModel, buildPageModel, buildAudienceModel } = require("./gaDashboardModel");

// 2026-10-21 01:30 India time, which is still 20 Oct in UTC.
const NOW = DateTime.fromISO("2026-10-20T20:00:00Z");

const emptyRaw = { totals: [], series: [], events: [], channels: [], pages: [], landing: [] };
const tile = (model, key) => model.totals.find((t) => t.key === key);

test("rangeWindows: ends yesterday in India time", () => {
    const w = rangeWindows("1d", NOW);
    assert.deepEqual(w.current, { since: "2026-10-20", until: "2026-10-20" });
    assert.deepEqual(w.previous, { since: "2026-10-19", until: "2026-10-19" });
    assert.equal(w.granularity, "hour");
});

test("rangeWindows: 7d and 30d compare with the period right before", () => {
    const w7 = rangeWindows("7d", NOW);
    assert.deepEqual(w7.current, { since: "2026-10-14", until: "2026-10-20" });
    assert.deepEqual(w7.previous, { since: "2026-10-07", until: "2026-10-13" });
    assert.equal(w7.granularity, "day");
    const w30 = rangeWindows("30d", NOW);
    assert.deepEqual(w30.current, { since: "2026-09-21", until: "2026-10-20" });
    assert.deepEqual(w30.previous, { since: "2026-08-22", until: "2026-09-20" });
});

test("rangeWindows: rejects an unknown range", () => {
    assert.throws(() => rangeWindows("2d", NOW), /Unknown range/);
});

test("empty GA answer gives zeros and nulls, never NaN", () => {
    const model = buildDashboardModel(emptyRaw, rangeWindows("7d", NOW));
    assert.equal(tile(model, "visitors").value, 0);
    assert.equal(tile(model, "engagementRate").value, null);
    assert.equal(tile(model, "engagementTime").value, null);
    assert.equal(model.signUpsPer100Sessions, null);
    assert.ok(!JSON.stringify(model).includes("NaN"));
});

test("series fills days GA left out and lines the previous period up by position", () => {
    const w = rangeWindows("7d", NOW);
    const raw = {
        ...emptyRaw,
        series: [
            { date: "20261014", dateRange: "date_range_0", activeUsers: 10, sessions: 12, screenPageViews: 30 },
            { date: "20261007", dateRange: "date_range_1", activeUsers: 4, sessions: 5, screenPageViews: 9 },
        ],
    };
    const model = buildDashboardModel(raw, w);
    assert.equal(model.series.length, 7);
    assert.equal(model.series[0].visitors, 10);
    assert.equal(model.series[0].prevVisitors, 4);
    assert.equal(model.series[0].prevKey, "2026-10-07");
    assert.equal(model.series[1].visitors, 0);
    assert.equal(model.series[0].label, "14 Oct");
});

test("1d series has 24 hourly points", () => {
    const model = buildDashboardModel(emptyRaw, rangeWindows("1d", NOW));
    assert.equal(model.series.length, 24);
    assert.equal(model.series[13].label, "13:00");
});

test("small numbers show 'was N' with no percent or direction", () => {
    const raw = { ...emptyRaw, totals: [
        { dateRange: "date_range_0", activeUsers: 12, sessions: 15, engagedSessions: 6, screenPageViews: 40, newUsers: 9, userEngagementDuration: 600 },
        { dateRange: "date_range_1", activeUsers: 8, sessions: 10, engagedSessions: 5, screenPageViews: 30, newUsers: 6, userEngagementDuration: 400 },
    ] };
    const visitors = tile(buildDashboardModel(raw, rangeWindows("7d", NOW)), "visitors");
    assert.equal(visitors.changeLabel, "was 8");
    assert.equal(visitors.changePct, null);
    assert.equal(visitors.direction, null);
});

test("big numbers show a percent, direction, rate in pts and time per visitor", () => {
    const raw = { ...emptyRaw, totals: [
        { dateRange: "date_range_0", activeUsers: 120, sessions: 150, engagedSessions: 75, screenPageViews: 400, newUsers: 90, userEngagementDuration: 7200 },
        { dateRange: "date_range_1", activeUsers: 100, sessions: 100, engagedSessions: 40, screenPageViews: 300, newUsers: 70, userEngagementDuration: 8100 },
    ] };
    const model = buildDashboardModel(raw, rangeWindows("7d", NOW));
    assert.equal(tile(model, "visitors").changeLabel, "+20%");
    assert.equal(tile(model, "visitors").changePct, 20);
    assert.equal(tile(model, "visitors").direction, "up");
    assert.equal(tile(model, "engagementRate").value, 0.5);
    assert.equal(tile(model, "engagementRate").changeLabel, "+10.0 pts");
    assert.equal(tile(model, "engagementTime").value, 60);
    assert.equal(tile(model, "engagementTime").changeLabel, "was 1m 21s");
});

test("events before 7 Oct have no comparison and add notes", () => {
    const model = buildDashboardModel(emptyRaw, rangeWindows("30d", NOW));
    const signUp = model.events.find((e) => e.name === "sign_up");
    assert.equal(signUp.comparable, false);
    assert.equal(signUp.changeLabel, "no comparison yet");
    assert.equal(signUp.previous, null);
    assert.equal(model.notes.length, 2);
});

test("events compare once both periods start after 7 Oct", () => {
    const later = DateTime.fromISO("2026-11-30T00:00:00Z");
    const raw = { ...emptyRaw, events: [
        { eventName: "sign_up", dateRange: "date_range_0", eventCount: 30 },
        { eventName: "sign_up", dateRange: "date_range_1", eventCount: 20 },
    ] };
    const model = buildDashboardModel(raw, rangeWindows("7d", later));
    const signUp = model.events.find((e) => e.name === "sign_up");
    assert.equal(signUp.comparable, true);
    assert.equal(signUp.changeLabel, "+50%");
    assert.equal(model.notes.length, 0);
});

test("channels and pages: (not set) for empty paths, zero-session channels dropped", () => {
    const raw = { ...emptyRaw,
        channels: [
            { sessionDefaultChannelGroup: "Paid Social", dateRange: "date_range_0", sessions: 300, engagedSessions: 90 },
            { sessionDefaultChannelGroup: "Paid Social", dateRange: "date_range_1", sessions: 200, engagedSessions: 60 },
            { sessionDefaultChannelGroup: "Direct", dateRange: "date_range_1", sessions: 50, engagedSessions: 10 },
        ],
        landing: [{ landingPage: "", sessions: 40, engagedSessions: 10 }],
        pages: [{ pagePath: "/new-deals", screenPageViews: 100, activeUsers: 50, userEngagementDuration: 500 }],
    };
    const model = buildDashboardModel(raw, rangeWindows("7d", NOW));
    assert.deepEqual(model.channels.map((c) => c.channel), ["Paid Social"]);
    assert.equal(model.channels[0].changeLabel, "+50%");
    assert.equal(model.landingPages[0].path, "(not set)");
    assert.equal(model.landingPages[0].engagementRate, 0.25);
    assert.equal(model.topPages[0].engagementSeconds, 10);
});

test("sign-ups per 100 sessions", () => {
    const later = DateTime.fromISO("2026-11-30T00:00:00Z");
    const raw = { ...emptyRaw,
        totals: [{ dateRange: "date_range_0", activeUsers: 100, sessions: 200, engagedSessions: 100, screenPageViews: 1, newUsers: 1, userEngagementDuration: 1 }],
        events: [{ eventName: "sign_up", dateRange: "date_range_0", eventCount: 5 }],
    };
    assert.equal(buildDashboardModel(raw, rangeWindows("7d", later)).signUpsPer100Sessions, 2.5);
});

test("page model: views line and totals", () => {
    const w = rangeWindows("7d", NOW);
    const raw = {
        totals: [
            { dateRange: "date_range_0", screenPageViews: 50, activeUsers: 25, userEngagementDuration: 250 },
            { dateRange: "date_range_1", screenPageViews: 20, activeUsers: 10, userEngagementDuration: 50 },
        ],
        series: [{ date: "20261014", dateRange: "date_range_0", screenPageViews: 7 }],
    };
    const model = buildPageModel(raw, w, "/new-deals");
    assert.equal(model.path, "/new-deals");
    assert.equal(model.totals[0].value, 50);
    assert.equal(model.totals[2].value, 10);
    assert.equal(model.series.length, 7);
    assert.equal(model.series[0].views, 7);
});

const group = (model, key) => model.groups.find((g) => g.key === key);

test("audience: shares are out of all active users and empty names become (not set)", () => {
    const raw = {
        totalUsers: 200,
        country: [{ name: "United States", value: 150 }, { name: "", value: 10 }],
        device: [{ name: "mobile", value: 160 }, { name: "desktop", value: 50 }],
    };
    const model = buildAudienceModel(raw, rangeWindows("7d", NOW));
    assert.equal(model.totalUsers, 200);
    assert.deepEqual(group(model, "country").rows, [
        { name: "United States", value: 150, share: 0.75 },
        { name: "(not set)", value: 10, share: 0.05 },
    ]);
    // A person on two devices counts twice, so these can pass 100% together.
    assert.equal(group(model, "device").rows[0].share, 0.8);
    assert.deepEqual(group(model, "language").rows, []);
});

test("audience: new and returning use sessions and shares of that list", () => {
    const raw = { totalUsers: 500, newVsReturning: [{ name: "new", value: 90 }, { name: "returning", value: 10 }] };
    const g = group(buildAudienceModel(raw, rangeWindows("7d", NOW)), "newVsReturning");
    assert.equal(g.unit, "sessions");
    assert.deepEqual(g.rows.map((r) => [r.name, r.share]), [["New", 0.9], ["Returning", 0.1]]);
});

test("audience: age and gender are unavailable when GA sends nothing", () => {
    const model = buildAudienceModel({ totalUsers: 100, age: [], gender: undefined }, rangeWindows("7d", NOW));
    assert.equal(model.age.available, false);
    assert.equal(model.gender.available, false);
    assert.deepEqual(model.age.rows, []);
});

test("audience: age shows once GA has data", () => {
    const model = buildAudienceModel({ totalUsers: 100, age: [{ name: "25-34", value: 20 }], gender: [{ name: "female", value: 15 }] }, rangeWindows("7d", NOW));
    assert.equal(model.age.available, true);
    assert.equal(model.age.rows[0].share, 0.2);
    assert.equal(model.gender.available, true);
});

test("audience: no users gives null shares, never NaN", () => {
    const model = buildAudienceModel({ totalUsers: 0, country: [{ name: "India", value: 0 }] }, rangeWindows("1d", NOW));
    assert.equal(group(model, "country").rows[0].share, null);
    assert.ok(!JSON.stringify(model).includes("NaN"));
});

test("audience: an empty name and (not set) from GA are merged into one row", () => {
    const raw = { totalUsers: 100, city: [{ name: "Delhi", value: 40 }, { name: "(not set)", value: 8 }, { name: "", value: 4 }] };
    const rows = group(buildAudienceModel(raw, rangeWindows("7d", NOW)), "city").rows;
    assert.deepEqual(rows.map((r) => [r.name, r.value]), [["Delhi", 40], ["(not set)", 12]]);
});
