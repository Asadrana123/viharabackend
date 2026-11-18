// services/marketing/creativeEstimateModel.js
//
// "How will this new video / static / carousel do?" for the Studio's Estimate page.
// Pure: takes our past Meta ads (one row each, with their lifetime numbers and tags) and the
// new creative's tags, and returns a guess with a range. No AI here: the numbers come only
// from what our own ads really did.
//
// How it works, in plain words:
//   - Only past ads with enough data count (MIN_IMPRESSIONS and MIN_SPEND).
//   - Each past ad gets a weight for how much it is like the new one: same format (video,
//     image, carousel), same place the lead fills the form (Meta form or our website), same
//     buyer type. Newer ads count a bit more (half the weight after HALF_LIFE_DAYS).
//   - The guess is what a dollar bought across those ads, weighted. Thin groups are pulled
//     toward the whole account (PRIOR_*), so 2 lucky ads do not make a wild guess.
//   - The range is the 10th to 90th percentile of what single similar ads got per dollar,
//     each also pulled toward the guess by how little data it has.
//   - The backtest replays the past: each ad is guessed only from ads made before it, then
//     compared with what it really got. That is how wrong the tool "usually" is.

const { leadSplit } = require("./marketingDashboardModel");

const MIN_IMPRESSIONS = 500;
const MIN_SPEND = 10;
const HALF_LIFE_DAYS = 120;
const LOW_PCT = 0.1;
const HIGH_PCT = 0.9;
// How much "whole account" data a group's own data is mixed with.
const PRIOR_SPEND = 150; // dollars, for impressions, clicks and leads per dollar
const PRIOR_IMPRESSIONS = 3000; // for click rate and hook rate
// A match on these counts this many times more than a miss. State is tagged but not used: in
// the backtest on 2026-11-18 matching on it made guesses slightly worse; buyer type helped a little.
const WEIGHTS = { format: 4, leadPlace: 4, buyerType: 2 };
const MIN_CLOSE_ADS = 5; // fewer "close" ads (same format and lead place) than this = low confidence
const MIN_BACKTEST_HISTORY = 15; // ads made before one, needed to guess it in the backtest
const MIN_CALIBRATION = 20; // replayed ads needed before the guess is corrected by them
const METRICS = ["impressions", "clicks", "leads"];

const FORMATS = ["video", "image", "carousel"];
const LEAD_PLACES = ["meta_form", "website"];

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const DAY_MS = 86400000;

/** Where the lead fills the form, from Meta's optimisation goal. */
function leadPlaceOf(ad) {
    const goal = String(ad.optimizationGoal || "").toUpperCase();
    if (goal === "LEAD_GENERATION" || goal === "QUALITY_LEAD") return "meta_form";
    if (goal) return "website";
    return null;
}

function formatOf(ad) {
    const t = String(ad.creativeType || "").toLowerCase();
    if (FORMATS.includes(t)) return t;
    const o = String(ad.creative?.objectType || "").toUpperCase();
    if (o === "VIDEO") return "video";
    if (o === "PHOTO" || o === "SHARE") return "image";
    return null;
}

/**
 * One Zernio ad (GET /v1/ads) in the shape the model uses. `tags` are ours (buyer type,
 * state), from the AI tagging pass. Clicks are link clicks, like the Paid view.
 */
function adRow(ad, tags = {}) {
    const m = ad.metrics || {};
    const actions = m.actions || {};
    return {
        adId: String(ad.platformAdId || ad._id || ""),
        name: ad.name || ad.creative?.name || "",
        campaignName: ad.campaignName || "",
        createdAt: ad.platformCreatedAt || ad.createdAt || null,
        format: formatOf(ad),
        leadPlace: leadPlaceOf(ad),
        buyerType: tags.buyerType || null,
        state: tags.state || null,
        thumbnailUrl: ad.creative?.thumbnailUrl || ad.creative?.imageUrl || null,
        spend: n(m.spend),
        impressions: n(m.impressions),
        clicks: n(actions.link_click),
        leads: leadSplit(actions).leads,
        // Meta's "video_view" action is a 3-second view: the hook rate's top half.
        views3s: n(actions.video_view),
    };
}

const usable = (r) => Boolean(r.impressions >= MIN_IMPRESSIONS && r.spend >= MIN_SPEND && r.format && r.leadPlace);

/** How much a past ad is like the new creative. */
function similarity(past, target, now) {
    let w = 1;
    for (const key of Object.keys(WEIGHTS)) {
        if (!target[key]) continue;
        if (past[key] === target[key]) w *= WEIGHTS[key];
    }
    if (past.createdAt && now) {
        const ageDays = Math.max(0, (now - Date.parse(past.createdAt)) / DAY_MS);
        w *= 0.5 ** (ageDays / HALF_LIFE_DAYS);
    }
    return w;
}

function sums(rows, weightOf = () => 1) {
    const t = { spend: 0, impressions: 0, clicks: 0, leads: 0, views3s: 0, videoImpressions: 0, weight: 0 };
    for (const r of rows) {
        const w = weightOf(r);
        t.weight += w;
        for (const k of ["spend", "impressions", "clicks", "leads"]) t[k] += w * r[k];
        if (r.format === "video") {
            t.views3s += w * r.views3s;
            t.videoImpressions += w * r.impressions;
        }
    }
    return t;
}

/** Linear-interpolated weighted percentile. `items` = [{ value, weight }]. */
function weightedPercentile(items, p) {
    const list = items.filter((x) => Number.isFinite(x.value) && x.weight > 0).sort((a, b) => a.value - b.value);
    if (!list.length) return null;
    if (list.length === 1) return list[0].value;
    const total = list.reduce((s, x) => s + x.weight, 0);
    // Each item sits at the middle of its weight band.
    let acc = 0;
    const points = list.map((x) => {
        const at = (acc + x.weight / 2) / total;
        acc += x.weight;
        return { at, value: x.value };
    });
    if (p <= points[0].at) return points[0].value;
    if (p >= points[points.length - 1].at) return points[points.length - 1].value;
    for (let i = 1; i < points.length; i++) {
        if (p <= points[i].at) {
            const a = points[i - 1];
            const b = points[i];
            return a.value + ((b.value - a.value) * (p - a.at)) / (b.at - a.at);
        }
    }
    return points[points.length - 1].value;
}

/** Mix a group's own numbers with the account's: (own + prior x rate) / (own size + prior). */
const shrink = (own, size, prior, rate) => (own + prior * rate) / (size + prior);

/**
 * The guess for one target from a set of past ads.
 * @returns {object|null} per-dollar rates with ranges, click and hook rate, and the ads used
 */
function estimateFrom(history, target, { now = Date.now() } = {}) {
    const rows = history.filter(usable);
    if (rows.length < 3) return null;
    const all = sums(rows);
    const account = {
        impressions: all.impressions / all.spend,
        clicks: all.clicks / all.spend,
        leads: all.leads / all.spend,
        clickRate: all.clicks / all.impressions,
        hookRate: all.videoImpressions ? all.views3s / all.videoImpressions : null,
    };

    const weighted = rows.map((r) => ({ r, w: similarity(r, target, now) }));
    // Normalise so the biggest weight is 1: "weighted spend" then reads as real dollars of close ads.
    const maxW = Math.max(...weighted.map((x) => x.w));
    for (const x of weighted) x.w /= maxW;
    const t = sums(weighted.map((x) => x.r), (r) => weighted.find((x) => x.r === r).w);

    // A group can be thin on its own, so it leans on the account by PRIOR_SPEND dollars.
    const perDollar = {};
    for (const k of METRICS) perDollar[k] = shrink(t[k], t.spend, PRIOR_SPEND, account[k]);
    const clickRate = shrink(t.clicks, t.impressions, PRIOR_IMPRESSIONS, account.clickRate);
    const hookRate = target.format === "video" && account.hookRate != null ? shrink(t.views3s, t.videoImpressions, PRIOR_IMPRESSIONS, account.hookRate) : null;

    // The range: what single close ads got, each pulled toward the guess by its own size.
    const range = {};
    for (const k of METRICS) {
        const items = weighted.map(({ r, w }) => ({ value: shrink(r[k], r.spend, PRIOR_SPEND, perDollar[k]), weight: w }));
        range[k] = {
            low: Math.min(weightedPercentile(items, LOW_PCT), perDollar[k]),
            high: Math.max(weightedPercentile(items, HIGH_PCT), perDollar[k]),
        };
    }
    const rateRange = (num, den, guess) => {
        const items = weighted
            .filter(({ r }) => (den === "videoImpressions" ? r.format === "video" : true))
            .map(({ r, w }) => ({ value: shrink(r[num], r.impressions, PRIOR_IMPRESSIONS, guess), weight: w }));
        if (!items.length) return null;
        return { low: Math.min(weightedPercentile(items, LOW_PCT), guess), high: Math.max(weightedPercentile(items, HIGH_PCT), guess) };
    };

    const close = rows.filter((r) => r.format === target.format && r.leadPlace === target.leadPlace);
    const closest = [...weighted]
        .sort((a, b) => b.w - a.w)
        .slice(0, 8)
        .map(({ r, w }) => ({
            adId: r.adId,
            name: r.name,
            campaignName: r.campaignName,
            createdAt: r.createdAt,
            format: r.format,
            leadPlace: r.leadPlace,
            buyerType: r.buyerType,
            state: r.state,
            thumbnailUrl: r.thumbnailUrl,
            spend: round(r.spend),
            impressions: r.impressions,
            clicks: r.clicks,
            leads: r.leads,
            clickRate: r.impressions ? round(r.clicks / r.impressions, 4) : null,
            costPerLead: r.leads ? round(r.spend / r.leads) : null,
            match: round(w, 2),
        }));

    return {
        perDollar,
        range,
        clickRate: { expected: clickRate, ...rateRange("clicks", "impressions", clickRate) },
        hookRate: hookRate == null ? null : { expected: hookRate, ...rateRange("views3s", "videoImpressions", hookRate) },
        basis: {
            usableAds: rows.length,
            closeAds: close.length,
            closeSpend: round(close.reduce((s, r) => s + r.spend, 0)),
            confidence: close.length >= 15 ? "medium" : close.length >= MIN_CLOSE_ADS ? "low" : "very low",
        },
        closest,
    };
}

/**
 * A per-dollar guess turned into numbers for a budget. With a calibration (from backtest()),
 * the guess and range come from how far real ads landed from the plain guess; without one,
 * from the spread of the close ads.
 */
function forBudget(est, spend, calibration = null) {
    const out = {};
    for (const k of METRICS) {
        const plain = est.perDollar[k] * spend;
        const c = calibration?.[k];
        out[k] = c
            ? { expected: Math.round(plain * c.mid), low: Math.round(plain * c.low), high: Math.round(plain * c.high) }
            : { expected: Math.round(plain), low: Math.round(est.range[k].low * spend), high: Math.round(est.range[k].high * spend) };
    }
    out.costPerLead = out.leads.expected > 0 ? round(spend / out.leads.expected) : null;
    out.costPerClick = out.clicks.expected > 0 ? round(spend / out.clicks.expected) : null;
    out.cpm = out.impressions.expected > 0 ? round((spend / out.impressions.expected) * 1000) : null;
    return out;
}

/**
 * How far real ads landed from the plain guess, as actual / guessed: the middle (mid) and the
 * 10th / 90th percentiles. Checked on our ads (2026-04..11): the plain guess is too high for a
 * typical ad (a few winners bring most of the leads), so the page's guess is plain x mid and the
 * range is plain x low..high. Null with fewer than MIN_CALIBRATION rows.
 */
function calibrationFrom(rows) {
    if (rows.length < MIN_CALIBRATION) return null;
    const out = {};
    for (const k of METRICS) {
        const ratios = rows.map((x) => x[k].ratio).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
        if (ratios.length < MIN_CALIBRATION) return null;
        const at = (p) => weightedPercentile(ratios.map((value) => ({ value, weight: 1 })), p);
        const mid = at(0.5);
        out[k] = { mid, low: Math.min(at(LOW_PCT), mid), high: Math.max(at(HIGH_PCT), mid) };
    }
    return out;
}

/**
 * Replay the past: each usable ad, in the order they were made, guessed only from ads made
 * before it (at its own real spend), then compared with what it got. The calibration used for
 * each ad also comes only from ads before it, so "usually off by" and "inside the range" are
 * what the tool would really have said at the time.
 */
function backtest(history) {
    const rows = history.filter(usable).filter((r) => r.createdAt).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const replayed = [];
    for (let i = MIN_BACKTEST_HISTORY; i < rows.length; i++) {
        const r = rows[i];
        const now = Date.parse(r.createdAt);
        const before = rows.slice(0, i).filter((p) => Date.parse(p.createdAt) < now);
        if (before.length < MIN_BACKTEST_HISTORY) continue;
        const est = estimateFrom(before, r, { now });
        if (!est) continue;
        const cal = calibrationFrom(replayed);
        const row = { adId: r.adId, name: r.name, createdAt: r.createdAt, format: r.format, spend: round(r.spend), checked: Boolean(cal) };
        for (const k of METRICS) {
            const plain = est.perDollar[k] * r.spend;
            const c = cal?.[k];
            const predicted = c ? plain * c.mid : plain;
            row[k] = {
                plain,
                ratio: plain > 0 ? r[k] / plain : null,
                predicted: round(predicted, 1),
                low: c ? round(plain * c.low, 1) : null,
                high: c ? round(plain * c.high, 1) : null,
                actual: r[k],
                errorPct: r[k] > 0 ? round((Math.abs(predicted - r[k]) / r[k]) * 100, 0) : null,
                inRange: c ? r[k] >= plain * c.low - 0.5 && r[k] <= plain * c.high + 0.5 : null,
            };
        }
        replayed.push(row);
    }
    const checked = replayed.filter((x) => x.checked);
    const summary = { ads: checked.length, since: checked[0]?.createdAt || null };
    for (const k of METRICS) {
        const errors = checked.map((x) => x[k].errorPct).filter((e) => e != null).sort((a, b) => a - b);
        summary[k] = {
            medianErrorPct: errors.length ? errors[Math.floor((errors.length - 1) / 2)] : null,
            inRangePct: checked.length ? round((checked.filter((x) => x[k].inRange).length / checked.length) * 100, 0) : null,
        };
    }
    return {
        summary,
        calibration: calibrationFrom(replayed),
        ads: checked.map(({ adId, name, createdAt, format, spend, ...rest }) => ({
            adId,
            name,
            createdAt,
            format,
            spend,
            ...Object.fromEntries(METRICS.map((k) => [k, { predicted: rest[k].predicted, low: rest[k].low, high: rest[k].high, actual: rest[k].actual, inRange: rest[k].inRange }])),
        })),
    };
}

/**
 * The whole answer for the page.
 * @param {object[]} history   adRow() rows
 * @param {{ format, leadPlace, buyerType?, state? }} target
 * @param {{ dailyBudget: number, days: number }} plan
 * @param {{ summary }} [test]  a backtest() result, for "usually off by"
 */
function buildEstimate(history, target, plan, test = null, { now = Date.now() } = {}) {
    const est = estimateFrom(history, target, { now });
    if (!est) return { available: false, reason: "Not enough past ads with real results to compare with yet." };
    const spend = plan.dailyBudget * plan.days;
    const usableRows = history.filter(usable);
    // Biggest real daily spend we have seen on one ad, roughly: lifetime spend over its days is
    // not known here, so this uses the largest lifetime spend as a soft ceiling.
    const biggestAdSpend = Math.max(...usableRows.map((r) => r.spend));
    const warnings = [];
    if (est.basis.closeAds < MIN_CLOSE_ADS) {
        const count = est.basis.closeAds;
        const ads = `${count === 0 ? "No" : `Only ${count}`} past ${FORMAT_WORDS[target.format]} ${count === 1 ? "ad" : "ads"}`;
        warnings.push(`${ads} sent leads to ${PLACE_WORDS[target.leadPlace]}. This guess leans mostly on other kinds of ads.`);
    }
    if (spend > biggestAdSpend * 1.5) {
        warnings.push(`$${Math.round(spend)} is more than any single past ad has spent ($${Math.round(biggestAdSpend)}). Results often get worse per dollar as spend grows.`);
    }
    return {
        available: true,
        target,
        plan: { dailyBudget: plan.dailyBudget, days: plan.days, spend },
        numbers: forBudget(est, spend, test?.calibration || null),
        calibrated: Boolean(test?.calibration),
        clickRate: round4(est.clickRate),
        hookRate: est.hookRate ? round4(est.hookRate) : null,
        basis: est.basis,
        closest: est.closest,
        usuallyOffBy: test?.summary || null,
        warnings,
    };
}

const round4 = (r) => ({ expected: round(r.expected, 4), low: round(r.low, 4), high: round(r.high, 4) });

const FORMAT_WORDS = { video: "video", image: "image", carousel: "carousel" };
const PLACE_WORDS = { meta_form: "a Meta form", website: "our website" };

module.exports = {
    adRow,
    usable,
    similarity,
    weightedPercentile,
    estimateFrom,
    forBudget,
    backtest,
    calibrationFrom,
    buildEstimate,
    leadPlaceOf,
    formatOf,
    FORMATS,
    LEAD_PLACES,
    MIN_IMPRESSIONS,
    MIN_SPEND,
};
