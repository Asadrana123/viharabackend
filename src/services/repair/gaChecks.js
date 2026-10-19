// services/repair/gaChecks.js
//
// The Google Analytics check of the repair agent's daily run. It reads GA4 for
// the last complete day (India time) and returns the same { findings, covers }
// as the other checks in checks.js, so a problem becomes one incident and is
// resolved when the check stops finding it.
//
//   ga:no_sessions          GA4 recorded no sessions on the last complete day
//   ga:event_missing:<name> a tracked event had 0 on both of the last two days, though it
//                           averaged 5 or more a day before (two days, so a slow GA4 day does not trigger a fix)
//   ga:dimension:<name>     a custom dimension still has only "(not set)" values after GA4 had
//                           time to fill it, so the site is not sending the event parameter
//   ga:campaign_ids         ad links send a campaign ID where a campaign name should be
//
// A custom dimension that is not registered in GA4 is a setup gap, not a fault, so it never
// becomes an incident. When GA4 is not configured on the server the check does nothing.

const { DateTime } = require("luxon");
const { fetchGaReportData, fetchGaBreakdown, gaConfigured, TRACKED_EVENTS, PROPERTY_TIMEZONE } = require("../analytics/gaInsightsService");
const { campaignLabel, MIN_DAILY_AVG_FOR_TRACKING_CHECK, NEW_EVENTS_START } = require("../analytics/gaReportFormatter");

// The custom dimensions were created in GA4 on 16 Oct 2026 and GA4 needs 24 to 48 hours to fill them.
// Days before this date can only show "(not set)" and say nothing about the site.
const DIMENSIONS_READY_FROM = "2026-10-19";
const DIMENSION_DAYS = 3;
// Events needed in the window before "all (not set)" means anything.
const DIMENSIONS = [
    { name: "form_location", by: "sign_up_by_form", dimension: "customEvent:form_location", what: "sign_up events", minEvents: 5 },
    { name: "page_type", by: "property_view_by_page_type", dimension: "customEvent:page_type", what: "property_view events", minEvents: 20 },
];
// Sessions over 7 days with a campaign ID in place of a name before it is worth an incident.
const MIN_CAMPAIGN_ID_SESSIONS = 20;

const dayKey = (iso) => iso.replace(/-/g, "");
const sum = (list) => list.reduce((a, b) => a + b, 0);
const NOT_SET = new Set(["", "(not set)"]);

/**
 * Pure: turns GA4 rows into findings.
 * @param {object} p
 * @param {object} p.data    fetchGaReportData() result
 * @param {object} p.splits  { form_location: rows|null, page_type: rows|null }, rows from fetchGaBreakdown over `window`
 * @param {{since: string, until: string}|null} p.window  the days the splits cover, null when too early to judge
 * @returns {Array<{key, kind, title, evidence}>}
 */
function findingsFromGa({ data, splits = {}, window = null }) {
    const findings = [];
    const day = data.reportDay;
    const start = DateTime.fromISO(day, { zone: PROPERTY_TIMEZONE });
    const dayBefore = start.minus({ days: 1 }).toISODate();

    // No traffic at all.
    const row = data.daily.find((r) => r.date === dayKey(day));
    if (!row || row.sessions === 0) {
        findings.push({
            key: "ga:no_sessions",
            kind: "ga_issue",
            title: `Google Analytics recorded no sessions on ${day}`,
            evidence: { source: "the daily Google Analytics check", day, sessions: row ? row.sessions : "no row for the day", note: "GA4 days follow India time." },
        });
    }

    // A tracked event that stopped. The baseline is the 6 days before the last two.
    if (data.weekAgo >= NEW_EVENTS_START) {
        const count = (name, iso) => sum(data.events.filter((e) => e.eventName === name && e.date === dayKey(iso)).map((e) => e.eventCount));
        const baselineDays = Array.from({ length: 6 }, (_, i) => start.minus({ days: i + 2 }).toISODate());
        for (const name of TRACKED_EVENTS) {
            const avg = sum(baselineDays.map((d) => count(name, d))) / baselineDays.length;
            if (count(name, day) === 0 && count(name, dayBefore) === 0 && avg >= MIN_DAILY_AVG_FOR_TRACKING_CHECK) {
                findings.push({
                    key: `ga:event_missing:${name}`,
                    kind: "ga_issue",
                    title: `Google Analytics stopped counting ${name}: 0 on ${dayBefore} and ${day}, about ${avg.toFixed(1)} a day before`,
                    evidence: {
                        source: "the daily Google Analytics check",
                        event: name,
                        zeroOn: [dayBefore, day],
                        averagePerDayBefore: Number(avg.toFixed(1)),
                        baselineDays: `${baselineDays[baselineDays.length - 1]} to ${baselineDays[0]}`,
                    },
                });
            }
        }
    }

    // A custom dimension that never gets a value: the site does not send the event parameter.
    if (window) {
        for (const d of DIMENSIONS) {
            const rows = splits[d.name];
            if (!rows) continue; // not registered in GA4 yet: a setup gap, not a fault
            const total = sum(rows.map((r) => r.eventCount));
            const unset = sum(rows.filter((r) => NOT_SET.has(r[d.dimension] || "")).map((r) => r.eventCount));
            if (total >= d.minEvents && unset === total) {
                findings.push({
                    key: `ga:dimension:${d.name}`,
                    kind: "ga_issue",
                    title: `Google Analytics gets no "${d.name}" value on ${d.what}: all ${total} are "(not set)"`,
                    evidence: {
                        source: "the daily Google Analytics check",
                        customDimension: d.name,
                        eventParameter: d.name,
                        window: `${window.since} to ${window.until}`,
                        events: total,
                        withValue: 0,
                        note: `The "${d.name}" custom dimension was created in GA4 on 16 Oct 2026, so GA4 had time to fill it. The site's code should send "${d.name}" as a parameter on these events.`,
                    },
                });
            }
        }
    }

    // Ad links that send an ID where a name belongs.
    const ids = new Map();
    for (const r of data.campaignsWeek || []) {
        const label = campaignLabel(r.sessionCampaignName);
        if (label && label.startsWith("Campaign ID ")) ids.set(label, (ids.get(label) || 0) + r.sessions);
    }
    const idSessions = sum([...ids.values()]);
    if (idSessions >= MIN_CAMPAIGN_ID_SESSIONS) {
        findings.push({
            key: "ga:campaign_ids",
            kind: "ga_issue",
            title: `Ad links send a campaign ID instead of a name: ${idSessions} sessions in 7 days in Google Analytics`,
            evidence: {
                source: "the daily Google Analytics check",
                window: "the 7 days ending " + day,
                campaignIds: [...ids.entries()].map(([label, sessions]) => `${label.replace("Campaign ID ", "")}: ${sessions} sessions`),
                note: "GA4's campaign name comes from the utm_campaign value in the ad link. These links carry a number instead of a name, so the reports can't tell the campaigns apart. The fix is in the ad's URL parameters in Ads Manager, which is outside the code.",
            },
        });
    }

    return findings;
}

/** The check the daily run uses: reads GA4, returns { findings, covers }. */
async function checkAnalytics() {
    // Without GA4 on this server there is nothing to look at, and open GA incidents stay as they are.
    if (!gaConfigured()) return { findings: [], covers: () => false };

    const data = await fetchGaReportData();
    const until = data.reportDay;
    const sinceCandidate = DateTime.fromISO(until, { zone: PROPERTY_TIMEZONE }).minus({ days: DIMENSION_DAYS - 1 }).toISODate();
    const since = sinceCandidate > DIMENSIONS_READY_FROM ? sinceCandidate : DIMENSIONS_READY_FROM;
    const window = since <= until ? { since, until } : null;

    const splits = {};
    if (window) {
        for (const d of DIMENSIONS) splits[d.name] = await fetchGaBreakdown({ since, until, by: d.by });
    }
    return { findings: findingsFromGa({ data, splits, window }), covers: (key) => key.startsWith("ga:") };
}

module.exports = { checkAnalytics, findingsFromGa, DIMENSIONS_READY_FROM };
