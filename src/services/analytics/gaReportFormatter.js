// services/analytics/gaReportFormatter.js
//
// Turns the raw GA4 rows into the daily report. All arithmetic happens here, in
// code, so the numbers in Slack are never typed by a model. The Claude summary
// (gaSummaryService.js) only reads the figures this file produces.
//
// Pure functions: no network, no environment.

const { DateTime } = require("luxon");
const { TRACKED_EVENTS, PROPERTY_TIMEZONE } = require("./gaInsightsService");

// These events only exist from the 7 Oct 2026 tracking release, so there is nothing
// honest to compare them with before that date.
const NEW_EVENTS_START = "2026-10-07";

// Below this count on either side, a percent change is noise. Show the old number instead.
const MIN_FOR_PERCENT = 20;
// A zero day only counts as a tracking problem for events that normally happen this often per day.
const MIN_DAILY_AVG_FOR_TRACKING_CHECK = 5;

const nf = new Intl.NumberFormat("en-US");
const fmt = (n) => nf.format(Math.round(n));
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

function fmtDuration(seconds) {
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

// Slack reads &, < and > as markup.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "+12%" / "-8%", or "was 3" when the numbers are too small for a percent to mean anything. */
function change(current, previous) {
    if (previous == null) return "no comparison";
    if (current >= MIN_FOR_PERCENT && previous >= MIN_FOR_PERCENT) {
        const d = ((current - previous) / previous) * 100;
        return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
    }
    return `was ${fmt(previous)}`;
}

/** Same as change() for ratios, as a difference in percentage points. Needs enough sessions on both sides. */
function rateChange(current, previous, sessionsNow, sessionsBefore) {
    if (previous == null) return "no comparison";
    if (sessionsNow >= MIN_FOR_PERCENT && sessionsBefore >= MIN_FOR_PERCENT) {
        const d = (current - previous) * 100;
        return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`;
    }
    return `was ${pct(previous)}`;
}

const dayKey = (iso) => iso.replace(/-/g, "");
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function dailyTotals(rows, key) {
    const r = rows.find((x) => x.date === key);
    if (!r) return null;
    return {
        users: r.activeUsers,
        sessions: r.sessions,
        views: r.screenPageViews,
        newUsers: r.newUsers,
        engagementRate: r.sessions ? r.engagedSessions / r.sessions : 0,
        engagementSeconds: r.activeUsers ? r.userEngagementDuration / r.activeUsers : 0,
    };
}

/** Average of the daily totals over the seven days before the report day. */
function baselineTotals(rows, reportDay) {
    const start = DateTime.fromISO(reportDay, { zone: PROPERTY_TIMEZONE });
    const days = [];
    for (let i = 1; i <= 7; i++) {
        const t = dailyTotals(rows, dayKey(start.minus({ days: i }).toISODate()));
        days.push(t || { users: 0, sessions: 0, views: 0, newUsers: 0, engagementRate: 0, engagementSeconds: 0 });
    }
    const sessions = sum(days.map((d) => d.sessions));
    return {
        users: sum(days.map((d) => d.users)) / 7,
        sessions: sessions / 7,
        views: sum(days.map((d) => d.views)) / 7,
        newUsers: sum(days.map((d) => d.newUsers)) / 7,
        // Weighted by sessions, so a quiet day does not count as much as a busy one.
        engagementRate: sessions ? sum(days.map((d) => d.engagementRate * d.sessions)) / sessions : 0,
        engagementSeconds: sum(days.map((d) => d.engagementSeconds)) / 7,
    };
}

const historyReady = (iso) => iso >= NEW_EVENTS_START;

function eventRows(data) {
    const dayK = dayKey(data.reportDay);
    const weekK = dayKey(data.weekAgo);
    const start = DateTime.fromISO(data.reportDay, { zone: PROPERTY_TIMEZONE });
    const baselineKeys = Array.from({ length: 7 }, (_, i) => dayKey(start.minus({ days: i + 1 }).toISODate()));

    const count = (name, key) => sum(data.events.filter((e) => e.eventName === name && e.date === key).map((e) => e.eventCount));

    // The 7-day baseline starts on the same day as "a week ago", so one check covers both. Before
    // that day is past the release, the averages would be built from zeros.
    const weekOk = historyReady(data.weekAgo);
    const baselineOk = weekOk;

    return TRACKED_EVENTS.map((name) => {
        const today = count(name, dayK);
        const weekAgo = weekOk ? count(name, weekK) : null;
        const avg = baselineOk ? sum(baselineKeys.map((k) => count(name, k))) / 7 : null;
        return { name, count: today, weekAgo, avg, vsWeek: change(today, weekAgo), historyReady: weekOk && baselineOk };
    });
}

function channelRows(data) {
    const now = data.channels.filter((r) => r.dateRange === "date_range_0");
    const before = data.channels.filter((r) => r.dateRange === "date_range_1");
    return now.map((r) => {
        const prev = before.find((b) => b.sessionDefaultChannelGroup === r.sessionDefaultChannelGroup);
        return {
            channel: r.sessionDefaultChannelGroup,
            sessions: r.sessions,
            weekAgo: prev ? prev.sessions : 0,
            vsWeek: change(r.sessions, prev ? prev.sessions : 0),
            engagementRate: r.sessions ? r.engagedSessions / r.sessions : 0,
        };
    });
}

/**
 * Campaign names reach GA4 in different shapes: "Toorak+-+LA" and "Toorak - LA" are the same campaign,
 * and some ad links send the campaign ID instead of a name. Merge the spellings and label the IDs.
 * Built-in values such as (direct) and (organic) are channels, not campaigns, so they are skipped.
 */
function campaignLabel(raw) {
    if (!raw || raw === "(not set)" || raw.startsWith("(")) return null;
    let name = raw;
    try {
        name = decodeURIComponent(raw.replace(/\+/g, " "));
    } catch (e) {
        name = raw.replace(/\+/g, " ");
    }
    name = name.replace(/\s+/g, " ").trim();
    return /^\d{10,}$/.test(name) ? `Campaign ID ${name}` : name;
}

const MAX_CAMPAIGNS = 12;

function campaignRows(data) {
    const byName = new Map();
    const entry = (name) => {
        if (!byName.has(name)) byName.set(name, { name, sessionsDay: 0, engagedDay: 0, sessionsWeek: 0, engagedWeek: 0, signUpsWeek: 0 });
        return byName.get(name);
    };
    for (const r of data.campaignsDay || []) {
        const name = campaignLabel(r.sessionCampaignName);
        if (!name) continue;
        const e = entry(name);
        e.sessionsDay += r.sessions;
        e.engagedDay += r.engagedSessions;
    }
    for (const r of data.campaignsWeek || []) {
        const name = campaignLabel(r.sessionCampaignName);
        if (!name) continue;
        const e = entry(name);
        e.sessionsWeek += r.sessions;
        e.engagedWeek += r.engagedSessions;
    }
    for (const r of data.campaignSignUpsWeek || []) {
        const name = campaignLabel(r.sessionCampaignName);
        if (!name) continue;
        entry(name).signUpsWeek += r.eventCount;
    }
    return [...byName.values()]
        .sort((a, b) => b.sessionsWeek - a.sessionsWeek || b.sessionsDay - a.sessionsDay)
        .slice(0, MAX_CAMPAIGNS)
        .map((c) => ({
            name: c.name,
            sessionsDay: c.sessionsDay,
            engagementDay: c.sessionsDay ? c.engagedDay / c.sessionsDay : null,
            sessionsWeek: c.sessionsWeek,
            engagementWeek: c.sessionsWeek ? c.engagedWeek / c.sessionsWeek : null,
            signUpsWeek: c.signUpsWeek,
        }));
}

/** Everything the Slack message and the summary are built from. */
function buildReportModel(data) {
    const today = dailyTotals(data.daily, dayKey(data.reportDay));
    const weekAgo = dailyTotals(data.daily, dayKey(data.weekAgo));
    const avg = baselineTotals(data.daily, data.reportDay);
    const events = eventRows(data);

    const checks = [];
    if (!today || today.sessions === 0) {
        checks.push("GA4 returned no sessions for the report day. Check that the site is sending data.");
    }
    for (const e of events) {
        if (e.historyReady && e.count === 0 && e.avg >= MIN_DAILY_AVG_FOR_TRACKING_CHECK) {
            checks.push(`${e.name} had 0 events, against about ${e.avg.toFixed(1)} a day in the week before. Check the tracking.`);
        }
    }

    const headline = today
        ? [
              { label: "Visitors", value: fmt(today.users), vsWeek: change(today.users, weekAgo && weekAgo.users), vsAvg: change(today.users, avg.users) },
              { label: "Sessions", value: fmt(today.sessions), vsWeek: change(today.sessions, weekAgo && weekAgo.sessions), vsAvg: change(today.sessions, avg.sessions) },
              { label: "Page views", value: fmt(today.views), vsWeek: change(today.views, weekAgo && weekAgo.views), vsAvg: change(today.views, avg.views) },
              {
                  label: "Engagement rate",
                  value: pct(today.engagementRate),
                  vsWeek: rateChange(today.engagementRate, weekAgo && weekAgo.engagementRate, today.sessions, weekAgo ? weekAgo.sessions : 0),
                  vsAvg: rateChange(today.engagementRate, avg.engagementRate, today.sessions, avg.sessions * 7),
              },
              {
                  label: "Engagement time per visitor",
                  value: fmtDuration(today.engagementSeconds),
                  vsWeek: weekAgo ? `was ${fmtDuration(weekAgo.engagementSeconds)}` : "no comparison",
                  vsAvg: `was ${fmtDuration(avg.engagementSeconds)}`,
              },
          ]
        : [];

    const countOf = (name) => (events.find((e) => e.name === name) || {}).count || 0;
    const opens = countOf("renovation_open");

    return {
        day: data.reportDay,
        weekAgo: data.weekAgo,
        headline,
        events,
        pages: data.pages.map((p) => ({
            path: p.pagePath,
            views: p.screenPageViews,
            visitors: p.activeUsers,
            engagementSeconds: p.activeUsers ? p.userEngagementDuration / p.activeUsers : 0,
        })),
        landing: data.landing.map((p) => ({
            path: p.landingPage || "(not set)", // GA4 can return an empty landing page
            sessions: p.sessions,
            engagementRate: p.sessions ? p.engagedSessions / p.sessions : 0,
        })),
        channels: channelRows(data),
        sources: data.sources.slice(0, 6).map((s) => ({ source: s.sessionSourceMedium, sessions: s.sessions })),
        campaigns: campaignRows(data),
        signUpByForm: data.signUpByForm && data.signUpByForm.map((r) => ({ form: r["customEvent:form_location"] || "(not set)", count: r.eventCount })),
        viewByPageType: data.viewByPageType && data.viewByPageType.map((r) => ({ type: r["customEvent:page_type"] || "(not set)", count: r.eventCount })),
        ratios: {
            renovationGenerateOfOpen: opens ? countOf("renovation_generate") / opens : null,
            signUpsPer100Sessions: today && today.sessions ? (countOf("sign_up") / today.sessions) * 100 : null,
        },
        checks,
    };
}

function eventLine(e) {
    const base = `${e.name}: *${fmt(e.count)}*`;
    if (!e.historyReady) return `${base} (no comparison yet, tracking started 7 Oct)`;
    return `${base} (week ago ${fmt(e.weekAgo)}, ${e.vsWeek}; 7-day average ${e.avg.toFixed(1)})`;
}

/** Slack Block Kit message. Section text is kept well under Slack's 3,000 character limit. */
function buildSlackMessage(model, summary) {
    const date = DateTime.fromISO(model.day, { zone: PROPERTY_TIMEZONE }).toFormat("ccc d LLL yyyy");
    const blocks = [{ type: "header", text: { type: "plain_text", text: `Website report, ${date}` } }];
    // Slack cuts a section off at 3,000 characters. Split long text on line breaks instead of truncating it.
    const section = (text) => {
        let chunk = "";
        const flush = () => {
            if (chunk) blocks.push({ type: "section", text: { type: "mrkdwn", text: chunk } });
            chunk = "";
        };
        for (const line of text.split("\n")) {
            const piece = line.slice(0, 2900);
            if (chunk && chunk.length + piece.length + 1 > 2900) flush();
            chunk = chunk ? `${chunk}\n${piece}` : piece;
        }
        flush();
    };

    if (summary) section(summary);

    if (model.headline.length) {
        section(
            "*Traffic* (against the same weekday last week, and the average of the 7 days before)\n" +
                model.headline.map((h) => `• ${h.label}: *${h.value}* (${h.vsWeek}; ${h.vsAvg})`).join("\n")
        );
    } else {
        section("*Traffic*\nNo data for this day.");
    }

    section("*Events*\n" + model.events.map((e) => `• ${eventLine(e)}`).join("\n"));

    const split = [];
    split.push(
        model.signUpByForm === null
            ? "• Sign-ups by form: not available yet. The `form_location` custom dimension is not set up in GA4."
            : model.signUpByForm.length
              ? `• Sign-ups by form: ${model.signUpByForm.map((r) => `${esc(r.form)} ${r.count}`).join(", ")}`
              : "• Sign-ups by form: none"
    );
    split.push(
        model.viewByPageType === null
            ? "• Property views by page type: not available yet. The `page_type` custom dimension is not set up in GA4."
            : model.viewByPageType.length
              ? `• Property views by page type: ${model.viewByPageType.map((r) => `${esc(r.type)} ${r.count}`).join(", ")}`
              : "• Property views by page type: none"
    );
    if (model.ratios.renovationGenerateOfOpen !== null) {
        split.push(`• Renovation tool: ${pct(model.ratios.renovationGenerateOfOpen)} of opens reached a generated result`);
    }
    if (model.ratios.signUpsPer100Sessions !== null) {
        split.push(`• Sign-ups per 100 sessions: ${model.ratios.signUpsPer100Sessions.toFixed(1)}`);
    }
    section("*Breakdowns*\n" + split.join("\n"));

    if (model.pages.length) {
        section(
            "*Top pages* (views, visitors, engagement time per visitor)\n" +
                model.pages.map((p) => `• \`${esc(p.path)}\`: ${fmt(p.views)} views, ${fmt(p.visitors)} visitors, ${fmtDuration(p.engagementSeconds)}`).join("\n")
        );
    }
    if (model.landing.length) {
        section(
            "*Top landing pages* (sessions, engagement rate)\n" +
                model.landing.map((p) => `• \`${esc(p.path)}\`: ${fmt(p.sessions)} sessions, ${pct(p.engagementRate)}`).join("\n")
        );
    }
    if (model.channels.length) {
        section(
            "*Channels* (sessions, against the same weekday last week)\n" +
                model.channels.map((c) => `• ${esc(c.channel)}: *${fmt(c.sessions)}* (${c.vsWeek}), engagement ${pct(c.engagementRate)}`).join("\n")
        );
    }
    if (model.sources.length) {
        section("*Top sources*\n" + model.sources.map((s) => `• ${esc(s.source)}: ${fmt(s.sessions)}`).join("\n"));
    }
    if (model.campaigns.length) {
        const rate = (r) => (r === null ? "no sessions" : `${pct(r)} engaged`);
        section(
            "*Campaigns* (yesterday, last 7 days, sign-ups in the last 7 days)\n" +
                model.campaigns
                    .map(
                        (c) =>
                            `• ${esc(c.name)}: ${plural(c.sessionsDay, "session")} yesterday (${rate(c.engagementDay)}), ` +
                            `${fmt(c.sessionsWeek)} in 7 days (${rate(c.engagementWeek)}), ${plural(c.signUpsWeek, "sign-up")}`
                    )
                    .join("\n")
        );
    }
    if (model.checks.length) {
        section("*Tracking check*\n" + model.checks.map((c) => `• ${esc(c)}`).join("\n"));
    }

    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: "Source: Google Analytics 4. Days follow India time. Recent days can still change slightly as Google finishes processing." }],
    });

    return { text: `Website report, ${date}`, blocks };
}

/** Plain text version of a message, for the dry-run command. */
function messageToText(message) {
    return message.blocks
        .map((b) => (b.type === "header" ? `=== ${b.text.text} ===` : b.type === "section" ? b.text.text : b.elements.map((e) => e.text).join(" ")))
        .join("\n\n");
}


/**
 * The figures Claude reads, as display-ready text and counts. Rates and durations are already formatted
 * exactly as they appear in the Slack tables, so the written summary can quote them and be checked
 * against this same data.
 */
function buildSummaryFacts(model) {
    const rate = (r) => (r === null ? null : pct(r));
    return {
        day: model.day,
        sameWeekdayLastWeek: model.weekAgo,
        traffic: model.headline.map((h) => ({ metric: h.label, yesterday: h.value, vsSameWeekdayLastWeek: h.vsWeek, vsPrevious7DayAverage: h.vsAvg })),
        events: model.events.map((e) => ({
            event: e.name,
            yesterday: e.count,
            sameWeekdayLastWeek: e.historyReady ? e.weekAgo : "no comparison yet, tracking started 7 Oct",
            vsSameWeekdayLastWeek: e.historyReady ? e.vsWeek : "no comparison yet",
            previous7DayAverage: e.historyReady ? Number(e.avg.toFixed(1)) : "no comparison yet",
        })),
        // A breakdown that is not set up yet is a setup gap, not a finding. The Breakdowns table already
        // says so, so the summary does not get it and cannot list it as a problem.
        breakdowns: {
            ...(model.signUpByForm === null ? {} : { signUpsByForm: model.signUpByForm.map((r) => ({ form: r.form, count: r.count })) }),
            ...(model.viewByPageType === null ? {} : { propertyViewsByPageType: model.viewByPageType.map((r) => ({ pageType: r.type, count: r.count })) }),
            renovationGenerateShareOfOpens: model.ratios.renovationGenerateOfOpen === null ? null : pct(model.ratios.renovationGenerateOfOpen),
            signUpsPer100Sessions: model.ratios.signUpsPer100Sessions === null ? null : Number(model.ratios.signUpsPer100Sessions.toFixed(1)),
        },
        topPages: model.pages.map((p) => ({ path: p.path, views: p.views, visitors: p.visitors, engagementTimePerVisitor: fmtDuration(p.engagementSeconds) })),
        topLandingPages: model.landing.map((p) => ({ path: p.path, sessions: p.sessions, engagementRate: pct(p.engagementRate) })),
        channels: model.channels.map((c) => ({ channel: c.channel, sessions: c.sessions, vsSameWeekdayLastWeek: c.vsWeek, engagementRate: pct(c.engagementRate) })),
        topSources: model.sources.map((s) => ({ source: s.source, sessions: s.sessions })),
        campaigns: model.campaigns.map((c) => ({
            campaign: c.name,
            sessionsYesterday: c.sessionsDay,
            engagementRateYesterday: rate(c.engagementDay),
            sessionsLast7Days: c.sessionsWeek,
            engagementRateLast7Days: rate(c.engagementWeek),
            signUpsLast7Days: c.signUpsWeek,
        })),
        trackingChecks: model.checks,
    };
}

module.exports = { buildReportModel, buildSlackMessage, buildSummaryFacts, messageToText, change, campaignLabel, NEW_EVENTS_START, MIN_DAILY_AVG_FOR_TRACKING_CHECK };
