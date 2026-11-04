const test = require("node:test");
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");
const m = require("./marketingDashboardModel");
const { countFormSubmissions, countWebsiteSignups, websiteChannel } = require("./marketingLeadsService");

const ZONE = "America/Los_Angeles";
const NOW = DateTime.fromISO("2026-11-04T10:00:00", { zone: ZONE });

test("windows end yesterday in the ad account's time zone", () => {
    const w = m.rangeWindows("7d", ZONE, NOW);
    assert.deepEqual([w.current.since, w.current.until], ["2026-10-28", "2026-11-03"]);
    assert.deepEqual([w.previous.since, w.previous.until], ["2026-10-21", "2026-10-27"]);
    // Midnight Pacific (PDT, UTC-7) on Oct 28, to midnight after Nov 3 (PST, UTC-8).
    assert.equal(w.current.start.toISOString(), "2026-10-28T07:00:00.000Z");
    assert.equal(w.current.end.toISOString(), "2026-11-04T08:00:00.000Z");
    const d = m.rangeWindows("1d", ZONE, NOW);
    assert.deepEqual([d.current.since, d.previous.since], ["2026-11-03", "2026-11-02"]);
    assert.throws(() => m.rangeWindows("2d", ZONE, NOW));
});

test("leads split into form and website like the Slack report", () => {
    assert.deepEqual(m.leadSplit({ lead: 9, "onsite_conversion.lead_grouped": 8, "offsite_conversion.fb_pixel_lead": 1 }), { leads: 9, formLeads: 8, websiteLeads: 1 });
    assert.deepEqual(m.leadSplit({ "onsite_conversion.lead_grouped": 2 }), { leads: 2, formLeads: 2, websiteLeads: 0 });
    assert.deepEqual(m.leadSplit(undefined), { leads: 0, formLeads: 0, websiteLeads: 0 });
});

const day = (date, spend, form, web, extra = {}) => ({
    date,
    spend,
    impressions: 1000,
    clicks: 50,
    actions: { lead: form + web, "onsite_conversion.lead_grouped": form, "offsite_conversion.fb_pixel_lead": web, landing_page_view: 10 },
    ...extra,
});

test("paid series pairs each day with the same day of the previous period", () => {
    const w = m.rangeWindows("7d", ZONE, NOW);
    const rows = [day("2026-10-28", 10, 1, 0), day("2026-10-30", 30, 2, 1)]; // Oct 29 missing: no delivery
    const prev = [day("2026-10-21", 5, 0, 0), day("2026-10-22", 6, 1, 0)];
    const s = m.paidSeries(rows, prev, w.current);
    assert.equal(s.length, 7);
    assert.deepEqual(s[0], { date: "2026-10-28", prevDate: "2026-10-21", spend: 10, prevSpend: 5, leads: 1, prevLeads: 0, clicks: 50, prevClicks: 50 });
    assert.equal(s[1].spend, 0);
    assert.equal(s[1].prevSpend, 6);
    assert.equal(s[2].leads, 3);
});

function raw({ rows, previousRows, campaigns = [], previousCampaigns = [], ads = [] }) {
    return {
        paid: { timeline: { rows, previousRows }, campaigns, previousCampaigns, ads, error: null },
        organic: { dashboard: null, posts: null, error: "analytics_addon_required" },
    };
}

const noLeads = () => ({
    form: { total: 0, qualified: 0, byCampaign: new Map() },
    website: { paid: { total: 0, qualified: 0, byCampaign: new Map() }, organic: { total: 0, qualified: 0, bySource: new Map() } },
});

test("paid tiles: totals, cost per lead, and which way is good", () => {
    const w = m.rangeWindows("7d", ZONE, NOW);
    const dates = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
    const rows = dates.map((d) => day(d, 100, 3, 1));
    const prev = Array.from({ length: 7 }, (_, i) => day(`2026-10-${21 + i}`, 50, 2, 0));
    const leads = { current: noLeads(), previous: noLeads() };
    leads.current.form.total = 18;
    leads.current.website.paid.total = 5;
    const out = m.buildMarketingModel(raw({ rows, previousRows: prev }), leads, w);
    const t = Object.fromEntries(out.paid.tiles.map((x) => [x.key, x]));
    assert.equal(t.spend.value, 700);
    assert.equal(t.spend.changeLabel, "+100%");
    assert.equal(t.spend.better, null);
    assert.equal(t.metaLeads.value, 28);
    assert.equal(t.formLeads.value, 21);
    assert.equal(t.websiteLeads.value, 7);
    assert.equal(t.costPerLead.value, 25);
    assert.equal(t.costPerLead.previous, 25);
    assert.equal(t.costPerLead.better, "lower");
    assert.equal(t.received.value, 23);
    assert.equal(t.ctr.value, 0.05);
    assert.deepEqual(out.paid.leadsCheck, { metaForm: 21, receivedForm: 18, metaWebsite: 7, receivedWebsite: 5, qualified: 0, formWithoutCampaign: 0 });
    // Organic failing doesn't hide paid.
    assert.equal(out.organic.available, false);
    assert.equal(out.organic.error, "analytics_addon_required");
});

test("small numbers show 'was x' instead of a percent", () => {
    const w = m.rangeWindows("1d", ZONE, NOW);
    const out = m.buildMarketingModel(raw({ rows: [day("2026-11-03", 12, 1, 0)], previousRows: [day("2026-11-02", 8, 0, 0)] }), { current: noLeads(), previous: noLeads() }, w);
    const t = Object.fromEntries(out.paid.tiles.map((x) => [x.key, x]));
    assert.equal(t.spend.changeLabel, "was $8.00");
    assert.equal(t.spend.direction, null);
    assert.equal(t.metaLeads.changeLabel, "was 0");
    assert.equal(t.costPerLead.changeLabel, "no comparison");
});

test("campaign rows: Meta's leads next to the form leads we received, previous spend, no idle campaigns", () => {
    const campaigns = [
        { platformCampaignId: "111", campaignName: "Form test", platformCampaignStatus: "ACTIVE", metrics: { spend: 100, impressions: 2000, clicks: 80, actions: { lead: 10, "onsite_conversion.lead_grouped": 10 } } },
        { platformCampaignId: "222", campaignName: "Website test", platformCampaignStatus: "PAUSED", metrics: { spend: 300, impressions: 5000, clicks: 100, actions: { "offsite_conversion.fb_pixel_lead": 3 } } },
        { platformCampaignId: "333", campaignName: "Idle", metrics: { spend: 0, impressions: 0, clicks: 0, actions: {} } },
    ];
    const previous = [{ platformCampaignId: "111", metrics: { spend: 40, actions: { lead: 2 } } }];
    const received = new Map([["111", { leads: 9, qualified: 6 }]]);
    const rows = m.campaignRows(campaigns, previous, received);
    assert.deepEqual(rows.map((r) => r.id), ["222", "111"]);
    const form = rows.find((r) => r.id === "111");
    assert.equal(form.leads, 10);
    assert.equal(form.formReceived, 9);
    assert.equal(form.formQualified, 6);
    assert.equal(form.costPerLead, 10);
    assert.equal(form.prevSpend, 40);
    assert.equal(form.prevLeads, 2);
    assert.equal(rows[0].status, "paused");
    assert.equal(rows[0].costPerLead, 100);
});

test("ad rows: only ads that spent, biggest first, no cost per lead without leads", () => {
    const ads = [
        { platformAdId: "a", name: "A", metrics: { spend: 5, impressions: 100, clicks: 2, actions: {} } },
        { platformAdId: "b", name: "B", metrics: { spend: 50, impressions: 900, clicks: 30, actions: { lead: 5 } } },
        { platformAdId: "c", name: "C", metrics: { spend: 0, impressions: 10, clicks: 0, actions: {} } },
    ];
    const rows = m.adRows(ads);
    assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
    assert.equal(rows[0].costPerLead, 10);
    assert.equal(rows[1].costPerLead, null);
});

test("organic: tiles, platforms and top posts, boosted posts already left out", () => {
    const w = m.rangeWindows("7d", ZONE, NOW);
    const dashboard = {
        all: {
            totals: { impressions: 3000, reach: 2000, likes: 40, comments: 2, shares: 1, saves: 1, views: 1200, engagementRate: 1.47 },
            previousTotals: { impressions: 1300, reach: 500, likes: 40, comments: 3, shares: 1, saves: 0, views: 1400, engagementRate: 3.1 },
            followers: { current: 3909, gained: 7 },
            previousFollowers: { current: 3902, gained: 9 },
            daily: [{ date: "2026-10-28", impressions: 400, reach: 260, engagement: 6, views: 180, followersGained: 1 }],
            dataAsOf: "2026-11-04T08:33:33Z",
        },
        perPlatform: [
            { platform: "instagram", totals: { impressions: 1000, likes: 30, engagementRate: 3.29 }, previousTotals: { impressions: 1100, likes: 40 }, followers: { current: 182, gained: 5 } },
            { platform: "linkedin", totals: { impressions: 1900, likes: 11, comments: 1, engagementRate: 0.63 }, previousTotals: {}, followers: { current: 3656, gained: 0 } },
        ],
    };
    const posts = {
        posts: [
            { _id: "p1", platform: "instagram", content: "Low   engagement", platformPostUrl: "https://ig/p1", analytics: { likes: 1, views: 10 } },
            { _id: "p2", platform: "instagram", content: "Best post", platformPostUrl: "https://ig/p2", analytics: { likes: 5, comments: 1, views: 78, engagementRate: 6.41 } },
        ],
        lastSync: "2026-11-04T08:33:33Z",
    };
    const leads = { current: noLeads(), previous: noLeads() };
    leads.current.website.organic.total = 2;
    leads.current.website.organic.bySource.set("instagram", 2);
    const out = m.buildMarketingModel({ paid: { timeline: null, error: "Zernio down" }, organic: { dashboard, posts, error: null } }, leads, w);
    assert.equal(out.paid.available, false);
    const t = Object.fromEntries(out.organic.tiles.map((x) => [x.key, x]));
    assert.equal(t.posts.value, 2);
    assert.equal(t.engagements.value, 44);
    assert.equal(t.engagementRate.value, 0.0147);
    assert.equal(t.followers.changeLabel, "+7 this period");
    assert.equal(t.signups.value, 2);
    assert.deepEqual(out.organic.platforms.map((p) => p.platform), ["linkedin", "instagram"]);
    assert.deepEqual(out.organic.topPosts.map((p) => p.id), ["p2", "p1"]);
    assert.equal(out.organic.topPosts[1].text, "Low engagement");
    assert.equal(out.organic.series.length, 7);
    assert.deepEqual(out.organic.signupsBySource, [{ source: "instagram", count: 2 }]);
});

// ---------------------------------------------------------------------------
// Our own leads
// ---------------------------------------------------------------------------
const start = new Date("2026-10-28T07:00:00Z");
const end = new Date("2026-11-04T08:00:00Z");

test("form leads: each submission in the window counts, by Meta campaign id; organic forms are left out", () => {
    const docs = [
        {
            phone: "+15551234567",
            consent: true,
            formSubmissions: [
                { campaignId: "111", submittedAt: new Date("2026-10-29T12:00:00Z") },
                { campaignId: "111", submittedAt: new Date("2026-10-20T12:00:00Z") }, // before the window
                { campaignId: "222", submittedAt: new Date("2026-11-01T12:00:00Z") },
            ],
        },
        { phone: "", formSubmissions: [{ campaignId: "111", submittedAt: new Date("2026-10-30T12:00:00Z") }] },
        { phone: "+1555", consent: true, formSubmissions: [{ campaignId: "111", isOrganic: true, submittedAt: new Date("2026-10-30T12:00:00Z") }] },
        { phone: "+1555", smsConsent: true, campaignId: "333", createdAt: new Date("2026-11-02T12:00:00Z"), formSubmissions: [] }, // older record shape
    ];
    const out = countFormSubmissions(docs, start, end);
    assert.equal(out.total, 4);
    assert.equal(out.qualified, 3);
    assert.deepEqual(Object.fromEntries(out.byCampaign), { 111: { leads: 2, qualified: 1 }, 222: { leads: 1, qualified: 1 }, 333: { leads: 1, qualified: 1 } });
});

test("website sign-ups: paid Meta by utm_campaign, organic social by source, the rest ignored", () => {
    assert.equal(websiteChannel({ utm_source: "meta", utm_medium: "paid_social" }), "paid");
    assert.equal(websiteChannel({ utm_source: "instagram", utm_medium: "organic" }), "organic");
    assert.equal(websiteChannel({ utm_source: "linkedin", utm_medium: "social" }), "organic");
    assert.equal(websiteChannel({ utm_source: "google", utm_medium: "organic" }), null);
    const out = countWebsiteSignups([
        { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "toorak_deal_form_test", phone: "+1", consent: true },
        { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "toorak_deal_form_test", phone: "" },
        { utm_source: "fb", utm_medium: "paid", utm_campaign: "" },
        { utm_source: "ig", utm_medium: "organic" },
        { utm_source: "linkedin", utm_medium: "social", phone: "+1", smsConsent: true },
        { utm_source: "google", utm_medium: "cpc" },
        {},
    ]);
    assert.equal(out.paid.total, 3);
    assert.equal(out.paid.qualified, 1);
    assert.deepEqual(Object.fromEntries(out.paid.byCampaign), { toorak_deal_form_test: { leads: 2, qualified: 1 }, "(no campaign tag)": { leads: 1, qualified: 0 } });
    assert.equal(out.organic.total, 2);
    assert.equal(out.organic.qualified, 1);
    assert.deepEqual(Object.fromEntries(out.organic.bySource), { instagram: 1, linkedin: 1 });
});
