// services/repair/metaGraph.js
//
// Read-only Meta Marketing API calls for the repair checks: daily account
// totals, per-ad totals, and the live ads with their landing page links.
// Uses the same token as the daily Meta Ads report (ads_read is enough).

const axios = require("axios");
const { getRepairConfig } = require("../../config/repair/repairConfig");

const GRAPH = "https://graph.facebook.com/v20.0";

function account() {
    const { token, adAccountId } = getRepairConfig().meta;
    if (!token || !adAccountId) throw new Error("META_ADS_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not set");
    return { token, id: adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}` };
}

/** GET with Meta's paging followed to the end. */
async function getAll(path, params) {
    const { token } = account();
    let url = `${GRAPH}/${path}`;
    let query = { access_token: token, limit: 500, ...params };
    const rows = [];
    while (url) {
        const { data } = await axios.get(url, { params: query, timeout: 60000 });
        rows.push(...(data.data || []));
        url = data.paging?.next || null;
        query = undefined; // `next` already carries every param
    }
    return rows;
}

const actionValue = (list, type) => Number((list || []).find((a) => a.action_type === type)?.value || 0);

/**
 * Website registrations and Leads per day, counted on the day they happened
 * (not the day the ad was seen), so they line up with our database.
 * @returns {Promise<Array<{date, registrations, leads}>>} oldest first
 */
async function dailyConversions(since, until) {
    const rows = await getAll(`${account().id}/insights`, {
        level: "account",
        time_range: JSON.stringify({ since, until }),
        time_increment: 1,
        action_report_time: "conversion",
        fields: "date_start,actions",
    });
    return rows
        .map((r) => ({
            date: r.date_start,
            registrations: actionValue(r.actions, "offsite_conversion.fb_pixel_complete_registration"),
            leads: actionValue(r.actions, "offsite_conversion.fb_pixel_lead"),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/** Link clicks and landing page views per ad over a date range. */
async function adTraffic(since, until) {
    const rows = await getAll(`${account().id}/insights`, {
        level: "ad",
        time_range: JSON.stringify({ since, until }),
        fields: "ad_id,ad_name,inline_link_clicks,actions",
    });
    return rows.map((r) => ({
        adId: r.ad_id,
        adName: r.ad_name,
        linkClicks: Number(r.inline_link_clicks || 0),
        pageViews: actionValue(r.actions, "landing_page_view"),
    }));
}

// Every link an ad creative can send people to.
function creativeLinks(creative = {}) {
    const links = [];
    const spec = creative.object_story_spec || {};
    links.push(spec.link_data?.link, spec.link_data?.call_to_action?.value?.link);
    links.push(spec.video_data?.call_to_action?.value?.link);
    links.push(spec.template_data?.link);
    for (const child of spec.link_data?.child_attachments || []) links.push(child.link);
    for (const u of creative.asset_feed_spec?.link_urls || []) links.push(u.website_url);
    links.push(creative.link_url, creative.object_url);
    return [...new Set(links.filter((l) => typeof l === "string" && /^https?:\/\//.test(l)))];
}

/** Ads that are delivering now, with the pages they link to. */
async function activeAdsWithLinks() {
    const ads = await getAll(`${account().id}/ads`, {
        effective_status: JSON.stringify(["ACTIVE"]),
        fields: "id,name,creative{object_story_spec,asset_feed_spec,link_url,object_url}",
    });
    return ads.map((ad) => ({ adId: ad.id, adName: ad.name, links: creativeLinks(ad.creative) }));
}

module.exports = { dailyConversions, adTraffic, activeAdsWithLinks };
