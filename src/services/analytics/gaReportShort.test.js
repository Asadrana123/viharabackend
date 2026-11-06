const test = require("node:test");
const assert = require("node:assert/strict");
const { buildShortSlackMessage, buildSlackMessage, messageToText } = require("./gaReportFormatter");
const { campaignsList } = require("./gaDashboardModel");

const model = {
    day: "2026-11-02",
    weekAgo: "2026-10-26",
    headline: [
        { label: "Visitors", value: "61", vsWeek: "-70%", vsAvg: "-51%" },
        { label: "Sessions", value: "92", vsWeek: "-64%", vsAvg: "-42%" },
        { label: "Page views", value: "271", vsWeek: "-27%", vsAvg: "-9%" },
        { label: "Engagement rate", value: "77.2%", vsWeek: "+26.2 pts", vsAvg: "+25.6 pts" },
        { label: "Engagement time per visitor", value: "1m 23s", vsWeek: "was 0m 52s", vsAvg: "was 0m 48s" },
    ],
    events: [{ name: "sign_up", count: 7, weekAgo: 4, avg: 3.6, vsWeek: "was 4", historyReady: true }],
    pages: [{ path: "/deal", views: 48, visitors: 30, engagementSeconds: 39 }],
    landing: [{ path: "(not set)", sessions: 2, engagementRate: 0 }],
    channels: [],
    sources: [],
    campaigns: [{ name: "toorak_deal_form_test", sessionsDay: 19, engagementDay: 0.684, sessionsWeek: 83, engagementWeek: 0.554, signUpsWeek: 13 }],
    signUpByForm: [],
    viewByPageType: [],
    ratios: { renovationGenerateOfOpen: null, signUpsPer100Sessions: 7.6 },
    checks: [],
};

test("short message: key numbers, summary and dashboard link, no tables", () => {
    const text = messageToText(buildShortSlackMessage(model, "*What worked*\n• x", "https://www.vihara.ai/admin/webAnalytics?range=1d"));
    assert.match(text, /Visitors \*61\* \(-70% vs same day last week\)/);
    assert.match(text, /sign-ups \*7\*/);
    assert.match(text, /\*What worked\*/);
    assert.match(text, /admin\/webAnalytics/);
    assert.doesNotMatch(text, /Top pages|Campaigns|toorak_deal_form_test/);
});

test("short message: a failed summary still posts numbers and says so", () => {
    const text = messageToText(buildShortSlackMessage(model, ""));
    assert.match(text, /Visitors \*61\*/);
    assert.match(text, /summary could not be made/);
});

test("short message: tracking checks always show", () => {
    const text = messageToText(buildShortSlackMessage({ ...model, checks: ["sign_up had 0 events"] }, "summary"));
    assert.match(text, /Tracking check/);
    assert.match(text, /sign_up had 0 events/);
});

test("short message: no traffic data", () => {
    const text = messageToText(buildShortSlackMessage({ ...model, headline: [] }, ""));
    assert.match(text, /No traffic data/);
});

test("full message (repair agent) still has every table", () => {
    const text = messageToText(buildSlackMessage(model, "summary"));
    assert.match(text, /Top pages/);
    assert.match(text, /Top landing pages/);
    assert.match(text, /toorak_deal_form_test/);
});

test("campaignsList: merges spellings, labels IDs, skips channels, compares periods", () => {
    const rows = [
        { sessionCampaignName: "Toorak+-+LA", dateRange: "date_range_0", sessions: 10, engagedSessions: 5 },
        { sessionCampaignName: "Toorak - LA", dateRange: "date_range_0", sessions: 30, engagedSessions: 15 },
        { sessionCampaignName: "Toorak - LA", dateRange: "date_range_1", sessions: 20, engagedSessions: 4 },
        { sessionCampaignName: "52664723826524", dateRange: "date_range_0", sessions: 5, engagedSessions: 5 },
        { sessionCampaignName: "(organic)", dateRange: "date_range_0", sessions: 99, engagedSessions: 50 },
        { sessionCampaignName: "old_campaign", dateRange: "date_range_1", sessions: 8, engagedSessions: 1 },
    ];
    const signUps = [
        { sessionCampaignName: "Toorak - LA", dateRange: "date_range_0", eventCount: 3 },
        { sessionCampaignName: "Toorak+-+LA", dateRange: "date_range_1", eventCount: 1 },
    ];
    const list = campaignsList(rows, signUps, true);
    assert.deepEqual(list.map((c) => c.name), ["Toorak - LA", "Campaign ID 52664723826524"]);
    const t = list[0];
    assert.equal(t.sessions, 40);
    assert.equal(t.previous, 20);
    assert.equal(t.changeLabel, "+100%");
    assert.equal(t.engagementRate, 0.5);
    assert.equal(t.signUps, 3);
    assert.equal(t.prevSignUps, 1);
    assert.equal(list[1].isId, true);
});

test("campaignsList: no sign-up comparison before tracking started", () => {
    const list = campaignsList([{ sessionCampaignName: "a", dateRange: "date_range_0", sessions: 3, engagedSessions: 1 }], [], false);
    assert.equal(list[0].prevSignUps, null);
    assert.equal(list[0].changeLabel, "was 0");
});
