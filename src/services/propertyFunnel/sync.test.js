// Property Funnel sync jobs: the pure parts (no network, no database).
const test = require("node:test");
const assert = require("node:assert/strict");
const { awarenessFromName, formatOf, statusOf } = require("./sync/zernioAdsSync");
const { toPacificDays, pacificDateOfHour } = require("./sync/ga4Sync");
const { toPageRows } = require("./sync/claritySync");
const { toRow, propertyOf } = require("./sync/zernioPostsSync");

test("ads: format, status and Cold / Warm / Hot from the ad set name", () => {
  assert.equal(formatOf({ creativeType: "video" }), "Video");
  assert.equal(formatOf({ creativeType: "carousel" }), "Carousel");
  assert.equal(formatOf({ creativeType: "image" }), "Image");
  assert.equal(statusOf({ status: "active" }), "active");
  assert.equal(statusOf({ status: "paused" }), "paused");
  assert.equal(statusOf({ status: "archived" }), "ended");
  assert.equal(awarenessFromName("SF +15mi - Broad - Website Deal Form"), "Cold");
  assert.equal(awarenessFromName("NOLA page visitors 180d + video viewers"), "Warm");
  assert.equal(awarenessFromName("Retargeting - Baltimore"), "Warm");
  assert.equal(awarenessFromName("Leads list - not registered"), "Hot");
});

test("GA4 hours (India time) land on the right Pacific day", () => {
  // 9 Nov 13:00-14:00 IST = 8 Nov 23:30 - 9 Nov 00:30 PST: midpoint 9 Nov 00:00 → 9 Nov.
  assert.equal(pacificDateOfHour("2026110913"), "2026-11-09");
  assert.equal(pacificDateOfHour("2026110912"), "2026-11-08");
  const rows = toPacificDays([
    { dateHour: "2026110913", pagePath: "/listing/a#x", sessionDefaultChannelGroup: "Direct", sessionSourceMedium: "(direct) / (none)", sessions: 2, engagedSessions: 1, userEngagementDuration: 30 },
    { dateHour: "2026110914", pagePath: "/listing/a", sessionDefaultChannelGroup: "Direct", sessionSourceMedium: "(direct) / (none)", sessions: 3, engagedSessions: 2, userEngagementDuration: 40 },
    { dateHour: "2026110801", pagePath: "/listing/a", sessionDefaultChannelGroup: "Direct", sessionSourceMedium: "(direct) / (none)", sessions: 9, engagedSessions: 9, userEngagementDuration: 9 },
  ], "2026-11-08");
  const nov9 = rows.find((r) => r.date === "2026-11-09");
  assert.deepEqual([nov9.pagePath, nov9.sessions, nov9.engagedSessions, nov9.engagementSeconds], ["/listing/a", 5, 3, 70]);
  assert.ok(!rows.some((r) => r.date < "2026-11-08"), "hours before the window are dropped");
});

test("Clarity: property pages only, one row per URL", () => {
  const rows = toPageRows([
    { metricName: "Traffic", information: [{ Url: "https://www.vihara.ai/listing/a", totalSessionCount: "12" }, { Url: "https://www.vihara.ai/new-deals", totalSessionCount: "50" }] },
    { metricName: "ScrollDepth", information: [{ URL: "https://www.vihara.ai/listing/a", averageScrollDepth: 41.5 }] },
    { metricName: "RageClickCount", information: [{ Url: "https://www.vihara.ai/listing/a", subTotal: "2" }] },
    { metricName: "DeadClickCount", information: [{ Url: "https://www.vihara.ai/listing/a", subTotal: "1" }] },
  ]);
  assert.deepEqual(rows, [{ url: "https://www.vihara.ai/listing/a", sessions: 12, scrollDepth: 41.5, rageClicks: 2, deadClicks: 1, quickBacks: null }]);
});

test("organic posts: unknown numbers stay null, property from a link or a street address", () => {
  const listings = [{ slug: "1983-law-st-new-orleans", street: "1983 Law St" }];
  assert.equal(propertyOf("See https://www.vihara.ai/listing/401-rensselaer-ave-ogdensburg now", listings), "401-rensselaer-ave-ogdensburg");
  assert.equal(propertyOf("Bank-owned at 1983 Law St, New Orleans", listings), "1983-law-st-new-orleans");
  assert.equal(propertyOf("Brand post", listings), null);
  const r = toRow({ _id: "p1", platform: "linkedin", publishedAt: "2026-11-07T22:31:42Z", content: "Hi", mediaType: "image", analytics: { impressions: 100, likes: 3, comments: 1 } }, listings);
  assert.deepEqual(
    [r.platform, r.publishedAt, r.impressions, r.reach, r.engagement, r.clicks, r.videoViews],
    ["LinkedIn", "2026-11-07", 100, null, 4, null, null],
  );
  const v = toRow({ _id: "p2", platform: "instagram", publishedAt: "2026-11-07T22:31:42Z", content: "", mediaType: "video", analytics: { views: 324 } }, listings);
  assert.equal(v.videoViews, 324);
  assert.equal(v.engagement, null);
});
