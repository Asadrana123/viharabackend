// services/conversion/pageFunnels.js
//
// Every landing page Meta ads sent people to in the window, with its funnel:
//   ad spend → impressions → link clicks → landing page views (Meta)
//            → sessions (Clarity) → sign-ups saved in our database
//            → registrations Meta counted (pixel + CAPI)
// and the pages that get visitors but too few sign-ups.

const { DateTime } = require("luxon");
const { getConversionConfig } = require("../../config/conversion/conversionConfig");
const { getRepairConfig } = require("../../config/repair/repairConfig");
const { adFunnel, adsWithLinks } = require("./metaFunnel");
const { signupsForPage } = require("./pageSignups");
const { claritySessions } = require("./clarity");

/** The last `days` full days in the ad account's time zone, ending `endDaysAgo` days ago. */
function dateWindow(days, endDaysAgo = 0) {
    const zone = getRepairConfig().accountTimeZone;
    const end = DateTime.now().setZone(zone).startOf("day").minus({ days: endDaysAgo }); // exclusive
    const start = end.minus({ days });
    return { since: start.toISODate(), until: end.minus({ days: 1 }).toISODate(), start: start.toJSDate(), end: end.toJSDate() };
}

const pageKey = (url) => {
    const u = new URL(url);
    return `${u.origin.replace("://www.", "://")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
};

const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
const rate = (n, d) => (d > 0 ? Number((n / d).toFixed(4)) : null);

/** Ads that delivered in a window, grouped by the page of ours they link to. */
async function adsByPage(range) {
    const siteHost = new URL(getRepairConfig().siteUrl).hostname.replace(/^www\./, "");
    const rows = (await adFunnel(range.since, range.until)).filter((r) => r.impressions > 0);
    const links = new Map((await adsWithLinks(rows.map((r) => r.adId))).map((a) => [a.adId, a]));
    const pages = new Map();
    for (const row of rows) {
        const ad = links.get(row.adId);
        for (const link of ad?.links || []) {
            let u;
            try {
                u = new URL(link);
            } catch {
                continue;
            }
            if (u.hostname.replace(/^www\./, "") !== siteHost) continue;
            const key = pageKey(link);
            if (!pages.has(key)) pages.set(key, { url: `${u.origin}${u.pathname}`, ads: [] });
            pages.get(key).ads.push({ ...row, status: ad.status });
        }
    }
    return pages;
}

function totals(ads) {
    return {
        spend: Number(sum(ads, "spend").toFixed(2)),
        impressions: sum(ads, "impressions"),
        linkClicks: sum(ads, "linkClicks"),
        landingPageViews: sum(ads, "landingPageViews"),
        metaRegistrations: sum(ads, "registrations"),
        metaLeads: sum(ads, "leads"),
    };
}

/**
 * @returns {Promise<{window, previousWindow, pages: Array, flagged: Array}>}
 *   flagged: pages to investigate, biggest spend first
 */
async function buildPageFunnels() {
    const { windowDays, thresholds, maxPagesPerDay } = getConversionConfig();
    const range = dateWindow(windowDays);
    const previous = dateWindow(7, windowDays); // the week before, to compare
    const [now, before] = await Promise.all([adsByPage(range), adsByPage(previous).catch(() => new Map())]);

    const pages = [];
    for (const [key, { url, ads }] of now) {
        const t = totals(ads);
        const [signups, clarity, prevSignups] = await Promise.all([
            signupsForPage(url, range.start, range.end),
            claritySessions(url).catch(() => null),
            signupsForPage(url, previous.start, previous.end),
        ]);
        const visits = t.landingPageViews || t.linkClicks;
        const signupCount = signups ? signups.total : t.metaRegistrations;
        const prev = before.get(key);
        const prevTotals = prev ? totals(prev.ads) : null;
        const prevVisits = prevTotals ? prevTotals.landingPageViews || prevTotals.linkClicks : 0;
        const prevSignupCount = prevSignups ? prevSignups.total : prevTotals?.metaRegistrations || 0;

        pages.push({
            key,
            url,
            window: `${range.since} to ${range.until}`,
            ...t,
            claritySessions: clarity,
            signupsSaved: signups ? signups.total : null,
            signupsFromMetaAds: signups ? signups.fromMetaAds : null,
            signupsSource: signups ? signups.source : "unknown: this page's sign-ups aren't mapped, using Meta's registration count",
            signupRate: rate(signupCount, visits),
            clickToViewRate: rate(t.landingPageViews, t.linkClicks),
            previousWeek: prevTotals
                ? { window: `${previous.since} to ${previous.until}`, spend: prevTotals.spend, visits: prevVisits, signups: prevSignupCount, signupRate: rate(prevSignupCount, prevVisits) }
                : null,
            ads: ads.map((a) => ({ adId: a.adId, adName: a.adName, status: a.status, spend: a.spend, ctr: a.ctr, linkClicks: a.linkClicks, landingPageViews: a.landingPageViews, registrations: a.registrations })),
        });
    }

    const flagged = pages
        .filter((p) => {
            const visits = Math.max(p.landingPageViews || p.linkClicks, p.claritySessions || 0);
            const signups = p.signupsSaved ?? p.metaRegistrations;
            const lowRate = visits >= thresholds.minVisits && (p.signupRate ?? 0) < thresholds.minSignupRate;
            const paidForNothing = p.spend >= thresholds.minSpendForZero && signups === 0;
            return lowRate || paidForNothing;
        })
        .sort((a, b) => b.spend - a.spend)
        .slice(0, maxPagesPerDay);

    return { window: range, previousWindow: previous, pages, flagged };
}

module.exports = { buildPageFunnels, dateWindow, pageKey };
