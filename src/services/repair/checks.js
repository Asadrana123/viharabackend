// services/repair/checks.js
//
// The daily checks. Each returns { findings, covers }: `findings` are the
// problems seen now ({ key, kind, title, evidence }); `covers(key)` says which
// incident keys the check looked at, so an open incident it no longer finds
// is marked resolved. A check that fails to run covers nothing, so its
// incidents stay open instead of being resolved by mistake.
//
//   tracking  Meta stopped receiving Lead (or registrations) while sign-ups still happen
//   pages     the pages live ads send people to: errors, redirects away, missing
//             property, missing Meta pixel, slow; and ads whose clicks never
//             become page views

const axios = require("axios");
const { DateTime } = require("luxon");
const productModel = require("../../model/property/productModel");
const { getRepairConfig } = require("../../config/repair/repairConfig");
const { metaAdSignupsBetween } = require("../adsLoop/leadJoin");
const meta = require("./metaGraph");

// Dates in the ad account's time zone: the last `days` full days, ending yesterday.
function window(days) {
    const zone = getRepairConfig().accountTimeZone;
    const end = DateTime.now().setZone(zone).startOf("day"); // today 00:00, exclusive
    const start = end.minus({ days });
    return { since: start.toISODate(), until: end.minus({ days: 1 }).toISODate(), start: start.toJSDate(), end: end.toJSDate() };
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------
async function checkTracking() {
    const { thresholds } = getRepairConfig();
    const findings = [];
    const range = window(14);
    const days = await meta.dailyConversions(range.since, range.until);
    const table = days.map((d) => `${d.date}: ${d.registrations} registrations, ${d.leads} Leads`).join("\n");

    // Lead: every registration used to arrive with a Lead. Count registrations since the last Lead.
    let lastLead = -1;
    days.forEach((d, i) => d.leads > 0 && (lastLead = i));
    const after = days.slice(lastLead + 1);
    const regsWithoutLead = after.reduce((s, d) => s + d.registrations, 0);
    if (regsWithoutLead >= thresholds.regsWithoutLead) {
        const since = after.find((d) => d.registrations > 0)?.date || after[0]?.date;
        findings.push({
            key: "lead_event_missing",
            kind: "lead_event_missing",
            title: lastLead >= 0
                ? `Meta stopped receiving the Lead event: last Lead on ${days[lastLead].date}, then ${regsWithoutLead} registrations with 0 Leads`
                : `Meta received no Lead events in 14 days, but ${regsWithoutLead} registrations`,
            evidence: { lastLeadDate: lastLead >= 0 ? days[lastLead].date : null, since, regsWithoutLead, daily: table },
        });
    }

    // Registrations: our database has sign-ups from Meta ads, Meta saw none.
    const recent = window(3);
    const signups = await metaAdSignupsBetween(recent.start, recent.end);
    const metaRegs = days.filter((d) => d.date >= recent.since).reduce((s, d) => s + d.registrations, 0);
    if (signups >= thresholds.signupsWithoutRegs && metaRegs === 0) {
        findings.push({
            key: "registration_event_missing",
            kind: "registration_event_missing",
            title: `Meta received 0 registrations in 3 days, but ${signups} people signed up from Meta ads`,
            evidence: { from: recent.since, to: recent.until, signupsInDatabase: signups, metaRegistrations: metaRegs, daily: table },
        });
    }

    return { findings, covers: (key) => key === "lead_event_missing" || key === "registration_event_missing" };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
const pageKey = (url) => {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
};

/** Opens one page like a visitor's first request. */
async function fetchPage(url) {
    const started = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: () => true,
            responseType: "text",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ViharaRepairCheck/1.0)" },
        });
        return {
            status: res.status,
            finalUrl: res.request?.res?.responseUrl || url,
            ms: Date.now() - started,
            html: typeof res.data === "string" ? res.data : "",
        };
    } catch (error) {
        return { status: 0, error: error.code || error.message, finalUrl: url, ms: Date.now() - started, html: "" };
    }
}

async function checkPage(url, ads) {
    const { siteUrl, meta: metaConfig, thresholds } = getRepairConfig();
    const key = pageKey(url);
    const siteHost = new URL(siteUrl).hostname.replace(/^www\./, "");
    const isOurs = new URL(url).hostname.replace(/^www\./, "") === siteHost;
    const page = await fetchPage(url);
    const problems = [];

    if (page.status === 0) problems.push(`it didn't load (${page.error})`);
    else if (page.status >= 400) problems.push(`it answers with error ${page.status}`);
    if (isOurs && page.status && new URL(page.finalUrl).hostname.replace(/^www\./, "") !== siteHost) {
        problems.push(`it redirects away to ${page.finalUrl}`);
    }
    if (isOurs && page.status === 200 && metaConfig.pixelId && !page.html.includes(metaConfig.pixelId)) {
        problems.push(`the Meta pixel (${metaConfig.pixelId}) is missing from the page`);
    }
    const slug = new URL(page.finalUrl).pathname.match(/^\/auction\/([^/]+)\/?$/)?.[1];
    if (isOurs && slug && !(await productModel.exists({ slug: decodeURIComponent(slug) }))) {
        problems.push(`no property has the slug "${slug}", so the page shows "not found"`);
    }

    const adNames = ads.map((a) => a.adName);
    const findings = [];
    if (problems.length) {
        findings.push({
            key: `page_down:${key}`,
            kind: "page_down",
            title: `Ad landing page is broken: ${key} (${problems.join("; ")})`,
            evidence: { url, finalUrl: page.finalUrl, status: page.status, ms: page.ms, problems, ads: adNames },
        });
    } else if (page.ms > thresholds.slowPageMs) {
        findings.push({
            key: `page_slow:${key}`,
            kind: "page_slow",
            title: `Ad landing page is slow: ${key} took ${(page.ms / 1000).toFixed(1)}s to answer`,
            evidence: { url, ms: page.ms, ads: adNames },
        });
    }
    return findings;
}

async function checkPages() {
    const { thresholds } = getRepairConfig();
    const ads = await meta.activeAdsWithLinks();

    // Each linked page once, with the ads that use it.
    const byPage = new Map();
    for (const ad of ads) {
        for (const link of ad.links) {
            const key = pageKey(link);
            if (!byPage.has(key)) byPage.set(key, { url: link, ads: [] });
            byPage.get(key).ads.push(ad);
        }
    }
    const findings = [];
    for (const { url, ads: using } of byPage.values()) findings.push(...(await checkPage(url, using)));

    // Clicks that never become page views: the page is slow, broken, or redirects badly.
    const range = window(3);
    const linksByAd = new Map(ads.map((a) => [a.adId, a.links]));
    for (const t of await meta.adTraffic(range.since, range.until)) {
        if (!linksByAd.has(t.adId) || t.linkClicks < thresholds.minClicksForDropoff) continue;
        const rate = t.pageViews / t.linkClicks;
        if (rate >= thresholds.minPageViewRate) continue;
        findings.push({
            key: `page_dropoff:${t.adId}`,
            kind: "page_dropoff",
            title: `Most clicks on the ad "${t.adName}" never reach the page: ${t.linkClicks} clicks, ${t.pageViews} page views (${Math.round(rate * 100)}%)`,
            evidence: { adId: t.adId, adName: t.adName, from: range.since, to: range.until, linkClicks: t.linkClicks, pageViews: t.pageViews, links: linksByAd.get(t.adId) },
        });
    }

    return { findings, covers: (key) => key.startsWith("page_") };
}

const CHECKS = { tracking: checkTracking, pages: checkPages };

module.exports = { CHECKS, checkTracking, checkPages, fetchPage };
