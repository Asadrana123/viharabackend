// services/analytics/gaDashboardModel.js
//
// Turns raw Google Analytics rows into the JSON the admin "Website Analytics" tab draws.
// Pure: no network, no clock unless one is passed in, so it can be tested with made-up rows.
//
// Ranges end yesterday (India time). Today is left out because GA4 is still counting it.
//   1d  = yesterday            against the day before
//   7d  = the last 7 days      against the 7 days before them
//   30d = the last 30 days     against the 30 days before them

const { DateTime } = require("luxon");
const { PROPERTY_TIMEZONE } = require("./gaInsightsService");
const { change, rateChange, fmtDuration, NEW_EVENTS_START, MIN_FOR_PERCENT } = require("./gaReportFormatter");

const RANGE_DAYS = { "1d": 1, "7d": 7, "30d": 30 };
const RANGES = Object.keys(RANGE_DAYS);

const EVENT_LABELS = {
    sign_up: "Sign-ups",
    property_view: "Property views",
    renovation_open: "Renovation tool opened",
    renovation_generate: "Renovation result generated",
    email_agent: "Emailed an agent",
    bid_registration_submit: "Bid registrations",
};

/** Current and previous date windows for a range, in property time. */
function rangeWindows(range, now = DateTime.now()) {
    const days = RANGE_DAYS[range];
    if (!days) throw new Error(`Unknown range "${range}"`);
    const yesterday = now.setZone(PROPERTY_TIMEZONE).startOf("day").minus({ days: 1 });
    const prevEnd = yesterday.minus({ days });
    return {
        current: { since: yesterday.minus({ days: days - 1 }).toISODate(), until: yesterday.toISODate() },
        previous: { since: prevEnd.minus({ days: days - 1 }).toISODate(), until: prevEnd.toISODate() },
        granularity: days === 1 ? "hour" : "day",
    };
}

// GA4 numbers each date range in a multi-range report as date_range_0, date_range_1.
const CURRENT = "date_range_0";
const PREVIOUS = "date_range_1";
const pick = (rows, which, key, value) => rows.find((r) => r.dateRange === which && (key ? r[key] === value : true));
const num = (row, metric) => (row && Number.isFinite(row[metric]) ? row[metric] : 0);
const ratio = (top, bottom) => (bottom > 0 ? top / bottom : null);

/** "up" / "down" only when a percent is shown. Small numbers stay neutral. */
function direction(current, previous) {
    if (current < MIN_FOR_PERCENT || previous < MIN_FOR_PERCENT) return null;
    if (current === previous) return "flat";
    return current > previous ? "up" : "down";
}

function countTile(key, label, current, previous) {
    const changeLabel = change(current, previous);
    const showsPercent = changeLabel.startsWith("+") || changeLabel.startsWith("-");
    return {
        key,
        label,
        format: "number",
        value: current,
        previous,
        changeLabel,
        changePct: showsPercent && previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null,
        direction: direction(current, previous),
    };
}

function totalsTiles(rows) {
    const read = (which) => {
        const r = pick(rows, which);
        return {
            users: num(r, "activeUsers"),
            newUsers: num(r, "newUsers"),
            sessions: num(r, "sessions"),
            engaged: num(r, "engagedSessions"),
            views: num(r, "screenPageViews"),
            seconds: num(r, "userEngagementDuration"),
        };
    };
    const now = read(CURRENT);
    const before = read(PREVIOUS);
    const rateNow = ratio(now.engaged, now.sessions);
    const rateBefore = ratio(before.engaged, before.sessions);
    const timeNow = ratio(now.seconds, now.users);
    const timeBefore = ratio(before.seconds, before.users);
    return [
        countTile("visitors", "Visitors", now.users, before.users),
        countTile("newVisitors", "New visitors", now.newUsers, before.newUsers),
        countTile("sessions", "Sessions", now.sessions, before.sessions),
        countTile("pageViews", "Page views", now.views, before.views),
        {
            key: "engagementRate",
            label: "Engagement rate",
            format: "percent",
            value: rateNow,
            previous: rateBefore,
            changeLabel: rateNow == null || rateBefore == null ? "no comparison" : rateChange(rateNow, rateBefore, now.sessions, before.sessions),
            changePct: null,
            direction:
                rateNow == null || rateBefore == null || now.sessions < MIN_FOR_PERCENT || before.sessions < MIN_FOR_PERCENT
                    ? null
                    : rateNow === rateBefore ? "flat" : rateNow > rateBefore ? "up" : "down",
        },
        {
            key: "engagementTime",
            label: "Engagement time per visitor",
            format: "duration",
            value: timeNow,
            previous: timeBefore,
            changeLabel: timeBefore == null ? "no comparison" : `was ${fmtDuration(timeBefore)}`,
            changePct: null,
            direction: null,
        },
    ];
}

/** Every day (or hour) of the window, in order. GA4 leaves out rows where every metric is 0. */
function slots(window, granularity) {
    if (granularity === "hour") return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
    const out = [];
    for (let d = DateTime.fromISO(window.since); d <= DateTime.fromISO(window.until); d = d.plus({ days: 1 })) out.push(d.toISODate());
    return out;
}

const slotLabel = (slot, granularity) => (granularity === "hour" ? `${slot}:00` : DateTime.fromISO(slot).toFormat("d LLL"));

/** Current and previous series lined up by position: day 1 with day 1, and so on. */
function seriesRows(rows, windows, metrics) {
    const { current, previous, granularity } = windows;
    const dim = granularity === "hour" ? "hour" : "date";
    const cur = slots(current, granularity);
    const prev = slots(previous, granularity);
    const gaKey = (slot) => (granularity === "hour" ? slot : slot.replace(/-/g, ""));
    return cur.map((slot, i) => {
        const row = { key: slot, label: slotLabel(slot, granularity), prevKey: prev[i], prevLabel: slotLabel(prev[i], granularity) };
        for (const [name, metric] of Object.entries(metrics)) {
            row[name] = num(pick(rows, CURRENT, dim, gaKey(slot)), metric);
            row[`prev${name[0].toUpperCase()}${name.slice(1)}`] = num(pick(rows, PREVIOUS, dim, gaKey(prev[i])), metric);
        }
        return row;
    });
}

function eventsList(rows, windows, notes) {
    const comparable = windows.previous.since >= NEW_EVENTS_START;
    if (windows.current.since < NEW_EVENTS_START) notes.push("Event counts only cover 7 Oct 2026 onward, when this tracking started.");
    if (!comparable) notes.push("Event comparisons show once the earlier period also starts on or after 7 Oct 2026.");
    return Object.entries(EVENT_LABELS).map(([name, label]) => {
        const count = num(pick(rows, CURRENT, "eventName", name), "eventCount");
        const before = num(pick(rows, PREVIOUS, "eventName", name), "eventCount");
        return {
            name,
            label,
            count,
            previous: comparable ? before : null,
            comparable,
            changeLabel: comparable ? change(count, before) : "no comparison yet",
        };
    });
}

function channelsList(rows) {
    const names = [...new Set(rows.filter((r) => r.dateRange === CURRENT).map((r) => r.sessionDefaultChannelGroup))];
    return names
        .map((channel) => {
            const now = pick(rows, CURRENT, "sessionDefaultChannelGroup", channel);
            const before = pick(rows, PREVIOUS, "sessionDefaultChannelGroup", channel);
            const sessions = num(now, "sessions");
            return {
                channel: channel || "(not set)",
                sessions,
                previous: num(before, "sessions"),
                changeLabel: change(sessions, num(before, "sessions")),
                engagementRate: ratio(num(now, "engagedSessions"), sessions),
            };
        })
        .filter((c) => c.sessions > 0)
        .sort((a, b) => b.sessions - a.sessions);
}

const pathOrNotSet = (p) => (p && p !== "" ? p : "(not set)");

/**
 * @param {object} raw  result of fetchGaRangeData
 * @param {object} windows  result of rangeWindows
 */
function buildDashboardModel(raw, windows) {
    const notes = [];
    const totals = totalsTiles(raw.totals);
    const sessions = totals.find((t) => t.key === "sessions").value;
    const events = eventsList(raw.events, windows, notes);
    const signUps = events.find((e) => e.name === "sign_up").count;
    return {
        granularity: windows.granularity,
        timezone: PROPERTY_TIMEZONE,
        current: windows.current,
        previous: windows.previous,
        totals,
        series: seriesRows(raw.series, windows, { visitors: "activeUsers", sessions: "sessions", pageViews: "screenPageViews" }),
        channels: channelsList(raw.channels),
        events,
        signUpsPer100Sessions: sessions > 0 ? Number(((signUps / sessions) * 100).toFixed(1)) : null,
        topPages: raw.pages.map((r) => ({
            path: pathOrNotSet(r.pagePath),
            views: r.screenPageViews,
            visitors: r.activeUsers,
            engagementSeconds: ratio(r.userEngagementDuration, r.activeUsers) || 0,
        })),
        landingPages: raw.landing.map((r) => ({
            path: pathOrNotSet(r.landingPage),
            sessions: r.sessions,
            engagementRate: ratio(r.engagedSessions, r.sessions),
        })),
        notes,
    };
}

/** Same idea for one page: views, visitors, time per visitor, and a views line. */
function buildPageModel(raw, windows, path) {
    const read = (which) => {
        const r = pick(raw.totals, which);
        return { views: num(r, "screenPageViews"), users: num(r, "activeUsers"), seconds: num(r, "userEngagementDuration") };
    };
    const now = read(CURRENT);
    const before = read(PREVIOUS);
    const timeNow = ratio(now.seconds, now.users);
    const timeBefore = ratio(before.seconds, before.users);
    return {
        path,
        granularity: windows.granularity,
        current: windows.current,
        previous: windows.previous,
        totals: [
            countTile("views", "Views", now.views, before.views),
            countTile("visitors", "Visitors", now.users, before.users),
            {
                key: "engagementTime",
                label: "Time per visitor",
                format: "duration",
                value: timeNow,
                previous: timeBefore,
                changeLabel: timeBefore == null ? "no comparison" : `was ${fmtDuration(timeBefore)}`,
                changePct: null,
                direction: null,
            },
        ],
        series: seriesRows(raw.series, windows, { views: "screenPageViews" }),
    };
}

const AUDIENCE_GROUPS = [
    { key: "country", label: "Country", unit: "users" },
    { key: "region", label: "State or region", unit: "users" },
    { key: "city", label: "City", unit: "users" },
    { key: "device", label: "Device", unit: "users" },
    { key: "browser", label: "Browser", unit: "users" },
    { key: "os", label: "Operating system", unit: "users" },
    { key: "language", label: "Language", unit: "users" },
    { key: "newVsReturning", label: "New and returning visitors", unit: "sessions" },
];
const WORD = { new: "New", returning: "Returning" };

/**
 * Rows with a share of the total. A person on two devices counts in both, so shares can add up past 100%.
 * GA4 can send both an empty name and "(not set)" for the same thing, so rows with the same name are added together.
 */
function audienceRows(rows, total, labelOf = (n) => n) {
    const merged = new Map();
    for (const r of rows || []) {
        const name = labelOf(r.name && r.name !== "" ? r.name : "(not set)");
        merged.set(name, (merged.get(name) || 0) + r.value);
    }
    return [...merged.entries()]
        .map(([name, value]) => ({ name, value, share: total > 0 ? Number((value / total).toFixed(4)) : null }))
        .sort((a, b) => b.value - a.value);
}

/**
 * @param {object} raw  result of fetchGaAudienceData
 * @param {object} windows  result of rangeWindows
 */
function buildAudienceModel(raw, windows) {
    const totalUsers = raw.totalUsers || 0;
    const groups = AUDIENCE_GROUPS.map(({ key, label, unit }) => {
        const rows = raw[key] || [];
        // New and returning shares are out of all sessions in the list, because that list is complete.
        const total = key === "newVsReturning" ? rows.reduce((a, r) => a + r.value, 0) : totalUsers;
        return { key, label, unit, rows: audienceRows(rows, total, key === "newVsReturning" ? (n) => WORD[n] || n : undefined) };
    });
    const demographic = (rows) => ({ available: Array.isArray(rows) && rows.length > 0, rows: audienceRows(rows, totalUsers) });
    return {
        granularity: windows.granularity,
        timezone: PROPERTY_TIMEZONE,
        current: windows.current,
        previous: windows.previous,
        totalUsers,
        groups,
        age: demographic(raw.age),
        gender: demographic(raw.gender),
    };
}

module.exports = { rangeWindows, buildDashboardModel, buildPageModel, buildAudienceModel, RANGES };
