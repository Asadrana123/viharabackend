// services/marketing/adSimulationModel.js
//
// "If we spend $X, what do we get?" for the Marketing Performance tab's Simulate view.
// Pure: takes Zernio's daily account rows (GET /v1/ads/timeline) and returns what one
// dollar has bought in the past, so the page can multiply by any budget.
//
// How it works, in plain words:
//   - Only "running" days count: days with at least MIN_DAY_SPEND spent.
//   - The best guess is what a dollar bought over the last RECENT_DAYS days (all 90 days
//     when the recent part is too thin).
//   - The backtest replays the past: each week (BLOCK_DAYS running days) is guessed only
//     from the days before it, then compared with what really happened.
//   - The range comes from that backtest: how far real weeks landed from the guess
//     (10th to 90th percentile of actual / guessed). So "the range" means "how wrong the
//     guess has really been", not a promise. Checked on 2026-08-19..11-16 (10 weeks): a
//     range from the spread of past rates missed 4-5 weeks in 10, and even this one, when
//     built only from earlier weeks, caught 2 of 6 impression weeks. Too few weeks yet;
//     it firms up as history grows.
//
// Leads are Meta's count (form + website pixel), the same "Leads (Meta)" as the Paid view.

const { leadSplit } = require("./marketingDashboardModel");

const MIN_DAY_SPEND = 5;
const RECENT_DAYS = 28;
const BLOCK_DAYS = 7;
const MIN_BLOCK_SPEND = 50;
const MIN_RECENT_DAYS = 7;
const MIN_RECENT_SPEND = 100;
const MIN_PRIOR_DAYS = 14; // a backtest week needs at least this much history before it
const MIN_RANGE_WEEKS = 4; // backtest weeks needed before a range is drawn
const LOW_PCT = 0.1;
const HIGH_PCT = 0.9;
const METRICS = ["impressions", "clicks", "leads"];

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** One timeline row in the shape we use. Clicks are link clicks, like the Paid view's CTR. */
function dayNumbers(row) {
    const actions = row.actions || {};
    return {
        date: String(row.date).slice(0, 10),
        spend: n(row.spend),
        impressions: n(row.impressions),
        clicks: n(actions.link_click),
        leads: leadSplit(actions).leads,
    };
}

function totals(days) {
    const t = { days: days.length, spend: 0, impressions: 0, clicks: 0, leads: 0 };
    for (const d of days) for (const k of ["spend", ...METRICS]) t[k] += d[k];
    return t;
}

/** What one dollar bought: { impressions, clicks, leads } per $1, or null with no spend. */
function perDollar(days) {
    const t = totals(days);
    if (t.spend <= 0) return null;
    return Object.fromEntries(METRICS.map((k) => [k, t[k] / t.spend]));
}

/** Linear-interpolated percentile of an already sorted list. */
function percentile(sorted, p) {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const median = (list) => (list.length ? percentile([...list].sort((a, b) => a - b), 0.5) : null);

const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** The days a guess is based on: the last RECENT_DAYS calendar days, or all when too thin. */
function guessBasis(running) {
    const lastDate = running[running.length - 1].date;
    const recent = running.filter((d) => dayDiff(d.date, lastDate) < RECENT_DAYS);
    const t = totals(recent);
    if (recent.length >= MIN_RECENT_DAYS && t.spend >= MIN_RECENT_SPEND) return { days: recent, basis: "recent" };
    return { days: running, basis: "all" };
}

/**
 * Low / high multipliers on the guess, from past weeks' actual / guessed.
 * @returns {{ low, high } | null} null with fewer than MIN_RANGE_WEEKS weeks
 */
function spreadOf(weeks, metric) {
    const ratios = weeks
        .filter((w) => w[metric].predicted > 0)
        .map((w) => w[metric].actual / w[metric].predicted)
        .sort((a, b) => a - b);
    if (ratios.length < MIN_RANGE_WEEKS) return null;
    // The guess itself always sits inside its own range.
    return { low: Math.min(percentile(ratios, LOW_PCT), 1), high: Math.max(percentile(ratios, HIGH_PCT), 1) };
}

/**
 * Replay the past week by week, BLOCK_DAYS running days each, counted back from the latest
 * day. Each week is guessed only from what came before it, with the same rules as the live
 * guess.
 */
function backtest(running) {
    const weeks = [];
    for (let end = running.length; end - BLOCK_DAYS >= MIN_PRIOR_DAYS; end -= BLOCK_DAYS) {
        const week = running.slice(end - BLOCK_DAYS, end);
        const actual = totals(week);
        if (actual.spend < MIN_BLOCK_SPEND) continue;
        const rates = perDollar(guessBasis(running.slice(0, end - BLOCK_DAYS)).days);
        if (!rates) continue;
        const row = { since: week[0].date, until: week[week.length - 1].date, spend: round(actual.spend) };
        for (const k of METRICS) {
            const predicted = actual.spend * rates[k];
            row[k] = {
                predicted: round(predicted, 1),
                actual: actual[k],
                // Off by how much, as a share of what happened. Not defined when nothing happened.
                errorPct: actual[k] > 0 ? round((Math.abs(predicted - actual[k]) / actual[k]) * 100, 0) : null,
            };
        }
        weeks.push(row);
    }
    weeks.reverse();

    // "Usually off by": the middle miss across the weeks.
    const summary = {};
    for (const k of METRICS) {
        const errors = weeks.map((w) => w[k].errorPct).filter((e) => e != null);
        summary[k] = { medianErrorPct: errors.length ? round(median(errors), 0) : null };
    }
    return { weeks, summary };
}

/**
 * @param {object[]} rows     Zernio /v1/ads/timeline rows (date, spend, impressions, actions)
 * @param {{since: string, until: string}} window  the 90 days asked for
 */
function buildSimulationBasis(rows, window) {
    const running = (rows || [])
        .map(dayNumbers)
        .filter((d) => d.date >= window.since && d.date <= window.until && d.spend >= MIN_DAY_SPEND)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    const history = totals(running);
    const daySpends = running.map((d) => d.spend);

    const base = {
        window: { since: window.since, until: window.until },
        history: {
            runningDays: running.length,
            spend: round(history.spend),
            impressions: history.impressions,
            clicks: history.clicks,
            leads: history.leads,
            firstDay: running[0]?.date || null,
            lastDay: running[running.length - 1]?.date || null,
            typicalDaySpend: round(median(daySpends)),
            maxDaySpend: daySpends.length ? round(Math.max(...daySpends)) : null,
        },
    };

    if (running.length < MIN_RECENT_DAYS || history.spend < MIN_RECENT_SPEND) {
        return { ...base, available: false, reason: "Not enough ad spend in the last 90 days to base a forecast on." };
    }

    const { days, basis } = guessBasis(running);
    const guess = perDollar(days);
    const test = backtest(running);
    const b = totals(days);

    const perDollarOut = {};
    for (const k of METRICS) {
        const spread = spreadOf(test.weeks, k);
        perDollarOut[k] = {
            expected: round(guess[k], 6),
            low: spread ? round(guess[k] * spread.low, 6) : null,
            high: spread ? round(guess[k] * spread.high, 6) : null,
        };
    }

    return {
        ...base,
        available: true,
        basis: {
            kind: basis, // "recent" = last 28 days, "all" = the whole 90 days
            since: days[0].date,
            until: days[days.length - 1].date,
            runningDays: days.length,
            spend: round(b.spend),
            // The same rates, in the words marketing uses.
            cpm: b.impressions ? round((b.spend / b.impressions) * 1000) : null,
            costPerClick: b.clicks ? round(b.spend / b.clicks) : null,
            costPerLead: b.leads ? round(b.spend / b.leads) : null,
            clickRate: b.impressions ? round(b.clicks / b.impressions, 4) : null,
        },
        perDollar: perDollarOut,
        backtest: test,
    };
}

module.exports = { buildSimulationBasis, dayNumbers, perDollar, percentile, backtest, MIN_DAY_SPEND, RECENT_DAYS, BLOCK_DAYS };
