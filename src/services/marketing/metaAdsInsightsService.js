// services/marketing/metaAdsInsightsService.js
//
// Pulls ad-level performance from the Meta Marketing API (Insights endpoint)
// for the daily Meta Ads report. One call returns the last 7 full days split
// per day, so the analyst can compare yesterday against the week.
//
// Env:
//   META_ADS_ACCESS_TOKEN   System User token with the `ads_read` permission
//   META_AD_ACCOUNT_ID      Ad account id, with or without the "act_" prefix

const axios = require("axios");

const GRAPH_API_VERSION = "v20.0";

const FIELDS = [
    "date_start",
    "campaign_name",
    "adset_name",
    "ad_name",
    "ad_id",
    "spend",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "actions",
    "cost_per_action_type",
    "purchase_roas",
].join(",");

// Keep only the action types the analyst needs; Meta returns dozens.
const USEFUL_ACTIONS = new Set([
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
    "purchase",
    "link_click",
    "landing_page_view",
]);

function pickActions(list) {
    if (!Array.isArray(list)) return undefined;
    const out = {};
    for (const a of list) {
        if (USEFUL_ACTIONS.has(a.action_type)) out[a.action_type] = Number(a.value);
    }
    return Object.keys(out).length ? out : undefined;
}

// Flatten one Insights row into a compact object (smaller prompt, easier to read).
function compactRow(row) {
    return {
        date: row.date_start,
        campaign: row.campaign_name,
        adset: row.adset_name,
        ad: row.ad_name,
        ad_id: row.ad_id,
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        reach: Number(row.reach || 0),
        frequency: Number(row.frequency || 0),
        clicks: Number(row.clicks || 0),
        ctr: Number(row.ctr || 0),
        cpc: row.cpc !== undefined ? Number(row.cpc) : undefined,
        cpm: Number(row.cpm || 0),
        actions: pickActions(row.actions),
        cost_per_action: pickActions(row.cost_per_action_type),
        roas: row.purchase_roas?.[0] ? Number(row.purchase_roas[0].value) : undefined,
    };
}

/**
 * Fetch ad-level insights for the last 7 full days, one row per ad per day.
 * Follows Meta's paging until every row is loaded.
 * @returns {Promise<Array<object>>} compact rows, sorted by date
 */
async function fetchLast7DaysAdInsights() {
    const token = process.env.META_ADS_ACCESS_TOKEN;
    const rawAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!token || !rawAccountId) {
        throw new Error("META_ADS_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not set");
    }
    const accountId = rawAccountId.startsWith("act_") ? rawAccountId : `act_${rawAccountId}`;

    let url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/insights`;
    let params = {
        access_token: token,
        level: "ad",
        date_preset: "last_7d",
        time_increment: 1,
        fields: FIELDS,
        limit: 500,
    };

    const rows = [];
    while (url) {
        const { data } = await axios.get(url, { params, timeout: 60000 });
        rows.push(...(data.data || []));
        // `paging.next` is a full URL that already carries every param.
        url = data.paging?.next || null;
        params = undefined;
    }

    return rows.map(compactRow).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { fetchLast7DaysAdInsights };
