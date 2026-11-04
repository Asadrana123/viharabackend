// services/marketing/marketingDashboardModel.js
//
// Turns Zernio data and our own lead counts into the JSON the admin "Marketing Performance"
// tab draws. Pure: no network, no clock unless one is passed in, so it can be tested.
//
// Ranges end yesterday in the ad account's time zone (Meta counts days there), and today is
// left out because Meta is still counting it:
//   1d  = yesterday            against the day before
//   7d  = the last 7 days      against the 7 days before them   (30d and 90d the same way)
//
// Paid and organic are kept apart: paid = the Meta ad account, organic = posts on the
// connected social accounts (boosted posts left out).
//
// Leads: Meta's count ("Meta leads", split into form and website like the Slack report)
// is shown next to what reached our database ("received"), so a gap is visible.

const { DateTime } = require("luxon");
const { change, MIN_FOR_PERCENT } = require("../analytics/gaReportFormatter");

const RANGE_DAYS = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };
const RANGES = Object.keys(RANGE_DAYS);
const AD_ROWS = 25;
const TOP_POSTS = 10;
const POST_TEXT_CHARS = 140;

// Meta action types. "lead" is Meta's total of the two.
const FORM_LEAD = "onsite_conversion.lead_grouped";
const WEBSITE_LEAD = "offsite_conversion.fb_pixel_lead";

/** Current and previous windows for a range, as YYYY-MM-DD in `zone`, plus their UTC instants. */
function rangeWindows(range, zone, now = DateTime.now()) {
    const days = RANGE_DAYS[range];
    if (!days) throw new Error(`Unknown range "${range}"`);
    const yesterday = now.setZone(zone).startOf("day").minus({ days: 1 });
    const prevEnd = yesterday.minus({ days });
    const window = (first, last) => ({
        since: first.toISODate(),
        until: last.toISODate(),
        start: first.toUTC().toJSDate(),
        end: last.plus({ days: 1 }).toUTC().toJSDate(),
    });
    return {
        timezone: zone,
        current: window(yesterday.minus({ days: days - 1 }), yesterday),
        previous: window(prevEnd.minus({ days: days - 1 }), prevEnd),
    };
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ratio = (top, bottom) => (bottom > 0 ? top / bottom : null);
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Leads from Meta's action counts: { leads, formLeads, websiteLeads }. */
function leadSplit(actions = {}) {
    const formLeads = n(actions[FORM_LEAD]);
    const websiteLeads = n(actions[WEBSITE_LEAD]);
    const leads = actions.lead != null ? n(actions.lead) : formLeads + websiteLeads;
    return { leads, formLeads, websiteLeads };
}

function direction(current, previous, minimum = MIN_FOR_PERCENT) {
    if (current == null || previous == null || current < minimum || previous < minimum) return null;
    if (current === previous) return "flat";
    return current > previous ? "up" : "down";
}

const pctChange = (current, previous) => (previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null);

/**
 * One stat tile. `better` says which way is good ("higher" / "lower"), or null when neither
 * is (spend). The tab colours the change from it.
 */
function tile({ key, label, format, value, previous, better = "higher", minimum = MIN_FOR_PERCENT, changeLabel }) {
    const dir = direction(value, previous, minimum);
    return {
        key,
        label,
        format,
        value,
        previous,
        changeLabel: changeLabel ?? (previous == null ? "no comparison" : dir ? `${pctChange(value, previous) >= 0 ? "+" : ""}${pctChange(value, previous).toFixed(0)}%` : change(value ?? 0, previous)),
        changePct: dir ? pctChange(value, previous) : null,
        direction: dir,
        better,
    };
}

const money = (v) => `$${n(v).toFixed(2)}`;

function moneyTile(key, label, value, previous, better) {
    // Money changes read as a percent once both sides are $20 or more, else "was $x".
    const dir = direction(value, previous, 20);
    return tile({
        key,
        label,
        format: "currency",
        value,
        previous,
        better,
        minimum: 20,
        changeLabel: previous == null ? "no comparison" : dir ? undefined : `was ${money(previous)}`,
    });
}

/** Ratio tiles (CTR, cost per x) compare only when the counts under them are big enough. */
function ratioTile({ key, label, format, value, previous, better, enough }) {
    const fmt = (v) => (format === "currency" ? money(v) : `${(v * 100).toFixed(2)}%`);
    if (value == null || previous == null || !enough) {
        return { key, label, format, value, previous, changeLabel: previous == null ? "no comparison" : `was ${fmt(previous)}`, changePct: null, direction: null, better };
    }
    const dir = value === previous ? "flat" : value > previous ? "up" : "down";
    const pct = pctChange(value, previous);
    return { key, label, format, value, previous, changeLabel: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, changePct: pct, direction: dir, better };
}

// ---------------------------------------------------------------------------
// Paid
// ---------------------------------------------------------------------------
function sumRows(rows) {
    const t = { spend: 0, impressions: 0, clicks: 0, landingPageViews: 0, leads: 0, formLeads: 0, websiteLeads: 0 };
    for (const r of rows || []) {
        t.spend += n(r.spend);
        t.impressions += n(r.impressions);
        t.clicks += n(r.clicks);
        t.landingPageViews += n(r.actions?.landing_page_view);
        const l = leadSplit(r.actions);
        t.leads += l.leads;
        t.formLeads += l.formLeads;
        t.websiteLeads += l.websiteLeads;
    }
    t.spend = round(t.spend);
    return t;
}

function paidTiles(now, before, received) {
    const enoughClicks = now.impressions >= 1000 && before.impressions >= 1000;
    const enoughLeads = now.leads >= 5 && before.leads >= 5;
    return [
        moneyTile("spend", "Spend", now.spend, before.spend, null),
        tile({ key: "metaLeads", label: "Leads (Meta)", format: "number", value: now.leads, previous: before.leads, minimum: 10 }),
        tile({ key: "formLeads", label: "Form leads (Meta)", format: "number", value: now.formLeads, previous: before.formLeads, minimum: 10 }),
        tile({ key: "websiteLeads", label: "Website leads (Meta)", format: "number", value: now.websiteLeads, previous: before.websiteLeads, minimum: 10 }),
        ratioTile({ key: "costPerLead", label: "Cost per lead", format: "currency", value: ratio(now.spend, now.leads), previous: ratio(before.spend, before.leads), better: "lower", enough: enoughLeads }),
        tile({ key: "received", label: "Leads received (ours)", format: "number", value: received.now, previous: received.before, minimum: 10 }),
        tile({ key: "impressions", label: "Impressions", format: "number", value: now.impressions, previous: before.impressions }),
        tile({ key: "clicks", label: "Clicks", format: "number", value: now.clicks, previous: before.clicks }),
        ratioTile({ key: "ctr", label: "CTR", format: "percent", value: ratio(now.clicks, now.impressions), previous: ratio(before.clicks, before.impressions), better: "higher", enough: enoughClicks }),
        ratioTile({ key: "cpc", label: "Cost per click", format: "currency", value: ratio(now.spend, now.clicks), previous: ratio(before.spend, before.clicks), better: "lower", enough: enoughClicks }),
        ratioTile({ key: "cpm", label: "Cost per 1,000 impressions", format: "currency", value: ratio(now.spend * 1000, now.impressions), previous: ratio(before.spend * 1000, before.impressions), better: "lower", enough: enoughClicks }),
    ];
}

/** Day by day, the previous period's matching day next to it (day 1 with day 1, ...). */
function paidSeries(rows, previousRows, window) {
    const byDate = new Map((rows || []).map((r) => [r.date, r]));
    const prevSorted = [...(previousRows || [])].sort((a, b) => a.date.localeCompare(b.date));
    const out = [];
    let i = 0;
    for (let d = DateTime.fromISO(window.since); d <= DateTime.fromISO(window.until); d = d.plus({ days: 1 }), i++) {
        const date = d.toISODate();
        const r = byDate.get(date) || {};
        const p = prevSorted[i] || {};
        const l = leadSplit(r.actions);
        const pl = leadSplit(p.actions);
        out.push({
            date,
            prevDate: p.date || null,
            spend: round(n(r.spend)),
            prevSpend: round(n(p.spend)),
            leads: l.leads,
            prevLeads: pl.leads,
            clicks: n(r.clicks),
            prevClicks: n(p.clicks),
        });
    }
    return out;
}

function campaignRows(campaigns, previousCampaigns, formByCampaign) {
    const before = new Map((previousCampaigns || []).map((c) => [String(c.platformCampaignId), c]));
    return (campaigns || [])
        .map((c) => {
            const m = c.metrics || {};
            const l = leadSplit(m.actions);
            const p = before.get(String(c.platformCampaignId))?.metrics || {};
            const received = formByCampaign.get(String(c.platformCampaignId)) || { leads: 0, qualified: 0 };
            return {
                id: String(c.platformCampaignId),
                name: c.campaignName || String(c.platformCampaignId),
                status: String(c.platformCampaignStatus || c.status || "").toLowerCase(),
                objective: c.platformObjective || "",
                spend: round(n(m.spend)),
                impressions: n(m.impressions),
                clicks: n(m.clicks),
                ctr: ratio(n(m.clicks), n(m.impressions)),
                ...l,
                costPerLead: round(ratio(n(m.spend), l.leads)),
                formReceived: received.leads,
                formQualified: received.qualified,
                prevSpend: round(n(p.spend)),
                prevLeads: leadSplit(p.actions).leads,
            };
        })
        .filter((c) => c.spend > 0 || c.leads > 0 || c.formReceived > 0)
        .sort((a, b) => b.spend - a.spend || b.leads - a.leads);
}

function adRows(ads) {
    return (ads || [])
        .filter((a) => n(a.metrics?.spend) > 0)
        .map((a) => {
            const m = a.metrics || {};
            const l = leadSplit(m.actions);
            return {
                id: String(a.platformAdId || a._id),
                name: a.name || "",
                campaign: a.campaignName || "",
                adSet: a.adSetName || "",
                status: String(a.platformStatus || a.status || "").toLowerCase(),
                spend: round(n(m.spend)),
                impressions: n(m.impressions),
                clicks: n(m.clicks),
                ctr: ratio(n(m.clicks), n(m.impressions)),
                landingPageViews: n(m.actions?.landing_page_view),
                ...l,
                costPerLead: round(ratio(n(m.spend), l.leads)),
            };
        })
        .sort((a, b) => b.spend - a.spend)
        .slice(0, AD_ROWS);
}

const latest = (dates) => dates.filter(Boolean).map(String).sort().pop() || null;

function buildPaid(raw, leads, windows) {
    if (!raw.timeline) return { available: false, error: raw.error || "No ads data from Zernio." };
    const now = sumRows(raw.timeline.rows);
    const before = sumRows(raw.timeline.previousRows);
    const receivedNow = leads.current.form.total + leads.current.website.paid.total;
    const receivedBefore = leads.previous.form.total + leads.previous.website.paid.total;
    const campaigns = campaignRows(raw.campaigns, raw.previousCampaigns, leads.current.form.byCampaign);
    const knownIds = new Set(campaigns.map((c) => c.id));
    const formWithoutCampaign = [...leads.current.form.byCampaign].filter(([id]) => !knownIds.has(id)).reduce((s, [, r]) => s + r.leads, 0);

    return {
        available: true,
        error: raw.error || null,
        tiles: paidTiles(now, before, { now: receivedNow, before: receivedBefore }),
        series: paidSeries(raw.timeline.rows, raw.timeline.previousRows, windows.current),
        // Meta's count next to ours, so a gap shows.
        leadsCheck: {
            metaForm: now.formLeads,
            receivedForm: leads.current.form.total,
            metaWebsite: now.websiteLeads,
            receivedWebsite: leads.current.website.paid.total,
            qualified: leads.current.form.qualified + leads.current.website.paid.qualified,
            formWithoutCampaign,
        },
        campaigns,
        ads: adRows(raw.ads),
        websiteSignupsByCampaign: [...leads.current.website.paid.byCampaign]
            .map(([name, r]) => ({ name, leads: r.leads, qualified: r.qualified }))
            .sort((a, b) => b.leads - a.leads),
        lastSynced: latest((raw.ads || []).map((a) => a.metrics?.lastSyncedAt)),
    };
}

// ---------------------------------------------------------------------------
// Organic
// ---------------------------------------------------------------------------
const engagements = (t = {}) => n(t.likes) + n(t.comments) + n(t.shares) + n(t.saves);

function organicTiles(all, postCount, signups) {
    const t = all.totals || {};
    const p = all.previousTotals || null;
    const followers = all.followers || {};
    const prevFollowers = all.previousFollowers || null;
    return [
        tile({ key: "posts", label: "Posts published", format: "number", value: postCount, previous: null, changeLabel: "this period" }),
        tile({ key: "impressions", label: "Impressions", format: "number", value: n(t.impressions), previous: p ? n(p.impressions) : null }),
        tile({ key: "reach", label: "Reach", format: "number", value: n(t.reach), previous: p ? n(p.reach) : null }),
        tile({ key: "views", label: "Video views", format: "number", value: n(t.views), previous: p ? n(p.views) : null }),
        tile({ key: "engagements", label: "Engagements", format: "number", value: engagements(t), previous: p ? engagements(p) : null }),
        ratioTile({
            key: "engagementRate",
            label: "Engagement rate",
            format: "percent",
            value: t.engagementRate != null ? n(t.engagementRate) / 100 : null,
            previous: p?.engagementRate != null ? n(p.engagementRate) / 100 : null,
            better: "higher",
            enough: n(t.impressions) >= 1000 && n(p?.impressions) >= 1000,
        }),
        tile({
            key: "followers",
            label: "Followers",
            format: "number",
            value: n(followers.current),
            previous: prevFollowers ? n(prevFollowers.current) : null,
            changeLabel: `${n(followers.gained) >= 0 ? "+" : ""}${n(followers.gained)} this period`,
        }),
        tile({ key: "signups", label: "Website sign-ups from posts", format: "number", value: signups.now, previous: signups.before, minimum: 10 }),
    ];
}

function organicSeries(daily = [], window) {
    const byDate = new Map(daily.map((d) => [d.date, d]));
    const out = [];
    for (let d = DateTime.fromISO(window.since); d <= DateTime.fromISO(window.until); d = d.plus({ days: 1 })) {
        const r = byDate.get(d.toISODate()) || {};
        out.push({ date: d.toISODate(), impressions: n(r.impressions), reach: n(r.reach), views: n(r.views), engagement: n(r.engagement), followersGained: n(r.followersGained) });
    }
    return out;
}

function platformRows(perPlatform = []) {
    return perPlatform
        .map((p) => {
            const t = p.totals || {};
            const before = p.previousTotals || {};
            const account = (p.followers?.byAccount || [])[0] || {};
            return {
                platform: p.platform,
                followers: n(p.followers?.current ?? account.current),
                followersGained: n(p.followers?.gained ?? account.gained),
                impressions: n(t.impressions),
                prevImpressions: n(before.impressions),
                reach: n(t.reach),
                views: n(t.views),
                engagements: engagements(t),
                prevEngagements: engagements(before),
                clicks: n(t.clicks),
                engagementRate: t.engagementRate != null ? n(t.engagementRate) / 100 : null,
            };
        })
        .sort((a, b) => b.impressions - a.impressions || b.followers - a.followers);
}

function topPosts(posts = []) {
    return posts
        .map((post) => {
            const a = post.analytics || {};
            return {
                id: String(post._id),
                platform: post.platform || post.platforms?.[0]?.platform || "",
                publishedAt: post.publishedAt || null,
                text: String(post.content || "").replace(/\s+/g, " ").trim().slice(0, POST_TEXT_CHARS),
                url: post.platformPostUrl || post.platforms?.[0]?.platformPostUrl || null,
                thumbnailUrl: post.thumbnailUrl || null,
                impressions: n(a.impressions),
                reach: n(a.reach),
                views: n(a.views),
                engagements: engagements(a),
                clicks: n(a.clicks),
                engagementRate: a.engagementRate != null ? n(a.engagementRate) / 100 : null,
            };
        })
        .sort((x, y) => y.engagements - x.engagements || y.views - x.views || y.impressions - x.impressions)
        .slice(0, TOP_POSTS);
}

function buildOrganic(raw, leads, windows) {
    const all = raw.dashboard?.all;
    if (!all) return { available: false, error: raw.error || "No organic data from Zernio." };
    const posts = raw.posts?.posts || [];
    return {
        available: true,
        error: raw.error || null,
        tiles: organicTiles(all, raw.posts ? posts.length : null, { now: leads.current.website.organic.total, before: leads.previous.website.organic.total }),
        series: organicSeries(all.daily, windows.current),
        platforms: platformRows(raw.dashboard.perPlatform),
        topPosts: topPosts(posts),
        signupsBySource: [...leads.current.website.organic.bySource].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        lastSynced: all.dataAsOf || raw.posts?.lastSync || null,
    };
}

/**
 * @param {object} raw     result of zernioMarketingService.fetchMarketingData
 * @param {object} leads   { current, previous } from marketingLeadsService.leadsReceivedBetween
 * @param {object} windows result of rangeWindows
 */
function buildMarketingModel(raw, leads, windows) {
    const strip = ({ since, until }) => ({ since, until });
    return {
        timezone: windows.timezone,
        current: strip(windows.current),
        previous: strip(windows.previous),
        paid: buildPaid(raw.paid, leads, windows),
        organic: buildOrganic(raw.organic, leads, windows),
    };
}

module.exports = { RANGES, rangeWindows, buildMarketingModel, leadSplit, sumRows, campaignRows, adRows, topPosts, paidSeries };
