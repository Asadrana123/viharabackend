// services/marketing/zernioMarketingService.js
//
// Reads from Zernio for the Marketing Performance tab. Read-only: nothing here changes
// an ad, a post or an account.
//
//   Paid (Meta ad account)
//     GET /v1/ads/timeline    daily account totals, with the previous period
//     GET /v1/ads/campaigns   per-campaign totals for a date range
//     GET /v1/ads             per-ad totals for a date range
//   Organic (every connected social account)
//     GET /v1/analytics/dashboard   totals, previous totals, followers, daily; per platform too
//     GET /v1/analytics             the posts, for the top-posts table (content and link)
//
// Checked against live data on 2026-11-04: the timeline, campaign and ad endpoints give the
// same spend and lead totals for the same dates.

const zernio = require("../adsLoop/zernioClient");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");

const CAMPAIGN_PAGE = 100; // Zernio's maximum for /v1/ads/campaigns
const AD_PAGE = 500;
const POSTS_LIMIT = 100; // Zernio's maximum for /v1/analytics
const ORGANIC_PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "tiktok", "twitter", "threads", "pinterest"];

function zernioConfigured() {
    const { apiKey, adAccountId } = getAdsLoopConfig().zernio;
    return Boolean(apiKey && adAccountId);
}

const adScope = () => {
    const { adsAccountId, adAccountId } = getAdsLoopConfig().zernio;
    return { accountId: adsAccountId || undefined, adAccountId };
};

/** Daily account totals for the window and the window before it. */
async function fetchAdsTimeline(window) {
    const data = await zernio.request("get", "/v1/ads/timeline", {
        params: { ...adScope(), fromDate: window.since, toDate: window.until, compare: "previous" },
    });
    return { rows: data.rows || [], previousRows: data.previousRows || [], previousRange: data.previousRange || null };
}

/** Per-campaign totals. /v1/ads/campaigns has no page parameter; 100 is its maximum. */
async function fetchCampaigns(window) {
    const data = await zernio.request("get", "/v1/ads/campaigns", {
        params: { adAccountId: adScope().adAccountId, fromDate: window.since, toDate: window.until, limit: CAMPAIGN_PAGE },
    });
    const campaigns = data.campaigns || [];
    if ((data.pagination?.total || 0) > campaigns.length) {
        console.warn(`[marketing] Zernio returned ${campaigns.length} of ${data.pagination.total} campaigns; the rest are left out.`);
    }
    return campaigns;
}

async function fetchAds(window) {
    const out = [];
    for (let page = 1; ; page++) {
        const data = await zernio.request("get", "/v1/ads", {
            params: { adAccountId: adScope().adAccountId, source: "all", fromDate: window.since, toDate: window.until, limit: AD_PAGE, page },
        });
        out.push(...(data.ads || []));
        if (page >= (data.pagination?.pages || 1) || !(data.ads || []).length) break;
    }
    return out.filter((ad) => ["facebook", "instagram"].includes(ad.platform));
}

const dashboard = (window, platform) =>
    zernio.request("get", "/v1/analytics/dashboard", {
        params: { fromDate: window.since, toDate: window.until, compare: "previous_period", topPosts: 0, recentPosts: 0, ...(platform ? { platform } : {}) },
    });

/** Organic totals for all accounts, then one call per connected platform. */
async function fetchOrganic(window) {
    const all = await dashboard(window);
    const platforms = [...new Set((all.followers?.byAccount || []).map((a) => a.platform))].filter((p) => ORGANIC_PLATFORMS.includes(p));
    const perPlatform = await Promise.all(platforms.map(async (platform) => ({ platform, ...(await dashboard(window, platform)) })));
    return { all, perPlatform };
}

/** Organic posts published in the window (newest first), without boosted posts. */
async function fetchPosts(window) {
    const data = await zernio.request("get", "/v1/analytics", {
        params: { fromDate: window.since, toDate: window.until, limit: POSTS_LIMIT, sortBy: "date", order: "desc" },
    });
    return {
        posts: (data.posts || []).filter((p) => !p.isAd && p.status === "published"),
        total: data.overview?.publishedPosts ?? null,
        lastSync: data.overview?.lastSync || null,
    };
}

/** Everything the tab needs from Zernio. A failing organic call doesn't hide the paid numbers. */
async function fetchMarketingData(windows) {
    const [timeline, campaigns, previousCampaigns, ads, organic, posts] = await Promise.allSettled([
        fetchAdsTimeline(windows.current),
        fetchCampaigns(windows.current),
        fetchCampaigns(windows.previous),
        fetchAds(windows.current),
        fetchOrganic(windows.current),
        fetchPosts(windows.current),
    ]);
    const value = (r) => (r.status === "fulfilled" ? r.value : null);
    const error = (r) => (r.status === "rejected" ? r.reason?.message || String(r.reason) : null);
    return {
        paid: {
            timeline: value(timeline),
            campaigns: value(campaigns),
            previousCampaigns: value(previousCampaigns),
            ads: value(ads),
            error: error(timeline) || error(campaigns) || error(previousCampaigns) || error(ads),
        },
        organic: { dashboard: value(organic), posts: value(posts), error: error(organic) || error(posts) },
    };
}

module.exports = { zernioConfigured, fetchMarketingData, fetchAdsTimeline, fetchCampaigns, fetchAds, fetchOrganic, fetchPosts };
