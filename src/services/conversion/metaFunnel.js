// services/conversion/metaFunnel.js
//
// Read-only Meta calls for the sign-up doctor: each ad's funnel (spend →
// clicks → landing page views → registrations), one ad's creative and
// targeting, breakdowns by device / placement / age, and the pixel's own
// event counts (browser vs Conversions API, per page).

const axios = require("axios");
const { getAll, account, actionValue, creativeLinks, GRAPH } = require("../repair/metaGraph");

const REG = "offsite_conversion.fb_pixel_complete_registration";
const LEAD = "offsite_conversion.fb_pixel_lead";

const funnelRow = (r) => ({
    adId: r.ad_id,
    adName: r.ad_name,
    campaign: r.campaign_name,
    adset: r.adset_name,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    frequency: Number(Number(r.frequency || 0).toFixed(2)),
    ctr: Number(Number(r.ctr || 0).toFixed(2)),
    linkClicks: Number(r.inline_link_clicks || 0),
    landingPageViews: actionValue(r.actions, "landing_page_view"),
    registrations: actionValue(r.actions, REG),
    leads: actionValue(r.actions, LEAD),
});

/** Every ad with delivery in the range, with its funnel. Breakdown e.g. "device_platform". */
async function adFunnel(since, until, { breakdown, adId } = {}) {
    breakdown = breakdown ? String(breakdown).replace(/\s+/g, "").toLowerCase() : undefined;
    const rows = await getAll(`${adId || account().id}/insights`, {
        level: "ad",
        time_range: JSON.stringify({ since, until }),
        fields: "ad_id,ad_name,campaign_name,adset_name,spend,impressions,frequency,ctr,inline_link_clicks,actions",
        ...(breakdown && { breakdowns: breakdown }),
    });
    return rows.map((r) => ({ ...funnelRow(r), ...(breakdown && { [breakdown]: breakdown.split(",").map((b) => r[b]).join(" / ") }) }));
}

/** Ads that delivered at all in the range, with the pages they link to (paused ads included). */
async function adsWithLinks(adIds) {
    if (!adIds.length) return [];
    const out = [];
    for (let i = 0; i < adIds.length; i += 50) {
        const ads = await getAll(`${account().id}/ads`, {
            filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: adIds.slice(i, i + 50) }]),
            fields: "id,name,effective_status,creative{object_story_spec,asset_feed_spec,link_url,object_url}",
        });
        for (const ad of ads) out.push({ adId: ad.id, adName: ad.name, status: ad.effective_status, links: creativeLinks(ad.creative) });
    }
    return out;
}

/** What one ad says and who it is shown to — to check the page delivers on the ad's promise. */
async function adDetails(adId) {
    const { data: ad } = await axios.get(`${GRAPH}/${adId}`, {
        params: {
            fields: [
                "name,effective_status",
                "creative{title,body,call_to_action_type,image_url,thumbnail_url,object_story_spec,asset_feed_spec}",
                "adset{name,optimization_goal,billing_event,destination_type,promoted_object,targeting}",
                "campaign{name,objective}",
            ].join(","),
            access_token: account().token,
        },
        timeout: 60000,
    });
    const c = ad.creative || {};
    const spec = c.object_story_spec || {};
    const feed = c.asset_feed_spec || {};
    const t = ad.adset?.targeting || {};
    return {
        name: ad.name,
        status: ad.effective_status,
        campaign: `${ad.campaign?.name} (objective ${ad.campaign?.objective})`,
        adset: `${ad.adset?.name}: optimizes for ${ad.adset?.optimization_goal}${ad.adset?.promoted_object?.custom_event_type ? ` (${ad.adset.promoted_object.custom_event_type})` : ""}`,
        headline: c.title || spec.link_data?.name || (feed.titles || []).map((x) => x.text).join(" | "),
        primaryText: c.body || spec.link_data?.message || spec.video_data?.message || (feed.bodies || []).map((x) => x.text).join(" | "),
        description: spec.link_data?.description || (feed.descriptions || []).map((x) => x.text).join(" | "),
        callToAction: c.call_to_action_type || spec.link_data?.call_to_action?.type || spec.video_data?.call_to_action?.type,
        imageUrl: c.image_url || c.thumbnail_url || spec.link_data?.picture || spec.video_data?.image_url || "",
        links: creativeLinks(c),
        targeting: {
            ages: [t.age_min, t.age_max].filter(Boolean).join("-"),
            locations: [
                ...(t.geo_locations?.countries || []),
                ...(t.geo_locations?.regions || []).map((r) => r.name),
                ...(t.geo_locations?.cities || []).map((r) => `${r.name}${r.radius ? ` +${r.radius}${r.distance_unit || ""}` : ""}`),
                ...(t.geo_locations?.zips || []).map((z) => z.key),
            ].join(", "),
            interests: (t.flexible_spec || []).flatMap((f) => (f.interests || []).map((i) => i.name)).join(", "),
            placements: [...(t.publisher_platforms || []), ...(t.device_platforms || [])].join(", ") || "automatic",
            advantageAudience: t.targeting_automation?.advantage_audience === 1,
        },
    };
}

/**
 * The pixel's own counts from Events Manager, by `aggregation` (event, event_source
 * = browser vs server/CAPI, url, device_type, event_processing_results, match_keys…).
 * Needs a token with access to the pixel; the error says so if not.
 */
async function pixelStats({ aggregation, event, since, until }) {
    const pixelId = process.env.META_PIXEL_ID;
    if (!pixelId) throw new Error("META_PIXEL_ID is not set");
    const { data } = await axios.get(`${GRAPH}/${pixelId}/stats`, {
        params: {
            aggregation,
            ...(event && { event }),
            start_time: Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000),
            end_time: Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000),
            access_token: account().token,
        },
        timeout: 60000,
    });
    // Hourly buckets → totals per value.
    const totals = {};
    for (const bucket of data.data || []) {
        for (const d of bucket.data || []) {
            const key = d.value ?? d.key ?? "?";
            totals[key] = (totals[key] || 0) + Number(d.count || 0);
        }
    }
    return totals;
}

module.exports = { adFunnel, adsWithLinks, adDetails, pixelStats };
