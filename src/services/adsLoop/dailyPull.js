// services/adsLoop/dailyPull.js
//
// Step 1 / step 8 of the loop, every day at 06:00 IST:
//   1. List ads through Zernio; parse the LT-ID from each ad name. Ads
//      without an LT-ID are reported to Slack as "unmatched", never dropped silently.
//   2. Fetch yesterday's analytics per ad; upsert into results with the raw response.
//   3. Fetch organic post metrics for creatives with a zernio_post_id.
//   4. Join backend leads by utm_content to fill leads and qualified_leads.
//
// "Yesterday" is the ad account's day (ADS_LOOP_ACCOUNT_TZ).

const { DateTime } = require("luxon");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const AdResult = require("../../model/adsLoop/adResultModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const zernio = require("./zernioClient");
const slack = require("./slackBot");
const { parseLtId } = require("./ltId");
const { leadCountsBetween } = require("./leadJoin");
const { updateState } = require("./loopState");

const n = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 4) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

function yesterdayWindow() {
    const zone = getAdsLoopConfig().accountTimeZone;
    const start = DateTime.now().setZone(zone).minus({ days: 1 }).startOf("day");
    return { date: start.toISODate(), start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

// ---------------------------------------------------------------------------
// Paid ads
// ---------------------------------------------------------------------------
function adRow(day) {
    const impressions = n(day.impressions);
    const reach = n(day.reach);
    return {
        spend: n(day.spend),
        impressions,
        reach,
        frequency: impressions && reach ? round(impressions / reach) : null,
        clicks: n(day.clicks),
        ctr: n(day.ctr),
        cpc: n(day.cpc),
        cpm: n(day.cpm),
        engagements: n(day.engagement),
    };
}

/** Several ads can share an LT-ID (e.g. duplicated in Ads Manager): sum them. */
function addRows(a, b) {
    if (!a) return b;
    const sum = (k) => (a[k] === null && b[k] === null ? null : (a[k] || 0) + (b[k] || 0));
    const out = { spend: sum("spend"), impressions: sum("impressions"), reach: sum("reach"), clicks: sum("clicks"), engagements: sum("engagements") };
    out.frequency = out.impressions && out.reach ? round(out.impressions / out.reach) : null;
    out.ctr = out.impressions ? round((out.clicks / out.impressions) * 100) : null;
    out.cpc = out.clicks ? round(out.spend / out.clicks) : null;
    out.cpm = out.impressions ? round((out.spend / out.impressions) * 1000) : null;
    return out;
}

const STATUS_FROM_AD = { active: CREATIVE_STATUS.LIVE, paused: CREATIVE_STATUS.PAUSED };

async function pullAds(date) {
    const ads = await zernio.listAds({ fromDate: date, toDate: date });
    const byLtId = new Map();
    const unmatched = [];

    for (const ad of ads) {
        const ltId = parseLtId(ad.name);
        if (!ltId) {
            // Only ads that ran that day are worth an alert (old paused ads are ignored).
            if (ad.status === "active" || n(ad.metrics?.spend) > 0) unmatched.push(ad);
            continue;
        }
        const analytics = await zernio.getAdAnalytics(ad._id, { fromDate: date, toDate: date });
        const day = (analytics?.analytics?.daily || []).find((d) => d.date === date);
        const entry = byLtId.get(ltId) || { row: null, raw: [] };
        if (day) entry.row = addRows(entry.row, adRow(day));
        entry.raw.push({ adId: ad._id, platformAdId: ad.platformAdId, status: ad.status, day: day || null, currency: analytics?.ad?.currency });
        byLtId.set(ltId, entry);

        // Ads made in Ads Manager with the naming spec get linked to their creative.
        const status = STATUS_FROM_AD[ad.status];
        await AdCreative.updateOne(
            { ltId, status: { $ne: CREATIVE_STATUS.RETIRED }, $or: [{ "meta.adId": null }, { "meta.adId": ad.platformAdId }] },
            {
                $set: {
                    "meta.zernioAdId": ad._id,
                    "meta.adId": ad.platformAdId,
                    "meta.adSetId": ad.platformAdSetId,
                    "meta.campaignId": ad.platformCampaignId,
                    "meta.adName": ad.name,
                    ...(status ? { status } : {}),
                },
            }
        );
    }

    const unknown = [];
    for (const [ltId, { row, raw }] of byLtId) {
        if (!(await AdCreative.exists({ ltId }))) unknown.push(ltId);
        if (!row) continue;
        await AdResult.updateOne({ ltId, date, channel: "meta_ad" }, { $set: { ...row, raw } }, { upsert: true });
    }
    return { matched: byLtId.size, unmatched, unknown };
}

// ---------------------------------------------------------------------------
// Organic posts (lifetime totals -> daily change)
// ---------------------------------------------------------------------------
const ORGANIC_CHANNEL = { facebook: "fb_post", instagram: "ig_post" };
const LIFETIME_KEYS = ["impressions", "reach", "clicks", "likes", "comments", "shares", "saves"];

async function pullOrganic(date) {
    const creatives = await AdCreative.find({ zernioPostId: { $ne: null } }).select("ltId zernioPostId").lean();
    let rows = 0;
    for (const c of creatives) {
        let data;
        try {
            data = await zernio.getPostAnalytics(c.zernioPostId);
        } catch (error) {
            console.error(`[adsLoop] post analytics for ${c.ltId} failed:`, error.message);
            continue;
        }
        for (const pa of data?.platformAnalytics || []) {
            const channel = ORGANIC_CHANNEL[pa.platform];
            if (!channel || !pa.analytics) continue;
            const lifetime = Object.fromEntries(LIFETIME_KEYS.map((k) => [k, n(pa.analytics[k]) || 0]));

            // Results are daily: store today's change since the last stored total.
            const prev = await AdResult.findOne({ ltId: c.ltId, channel, date: { $lt: date } }).sort({ date: -1 }).lean();
            const before = prev?.raw?.lifetime || {};
            const delta = (k) => Math.max(0, lifetime[k] - (before[k] || 0));

            await AdResult.updateOne(
                { ltId: c.ltId, date, channel },
                {
                    $set: {
                        impressions: delta("impressions"),
                        reach: delta("reach"),
                        clicks: delta("clicks"),
                        engagements: delta("likes") + delta("comments") + delta("shares") + delta("saves"),
                        saves: delta("saves"),
                        shares: delta("shares"),
                        ctr: delta("impressions") ? round((delta("clicks") / delta("impressions")) * 100) : null,
                        raw: { lifetime, platformAnalytics: pa },
                    },
                },
                { upsert: true }
            );
            rows += 1;
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
async function joinLeads({ date, start, end }) {
    const counts = await leadCountsBetween(start, end);
    // Reset first, so a re-run of the same day never double counts.
    await AdResult.updateMany({ date }, { $set: { leads: 0, qualifiedLeads: 0 } });
    for (const { ltId, channel, leads, qualifiedLeads } of counts.values()) {
        await AdResult.updateOne({ ltId, date, channel }, { $set: { leads, qualifiedLeads } }, { upsert: true });
    }
    return counts.size;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let isRunning = false;

/** Runs the pull for yesterday (or `date`). Returns a short summary line. */
async function runDailyPull() {
    if (isRunning) return "A pull is already running";
    isRunning = true;
    const { adsWeeklyChannel } = getAdsLoopConfig().slack;
    const window = yesterdayWindow();
    try {
        const ads = await pullAds(window.date);
        const organicRows = await pullOrganic(window.date);
        const leadRows = await joinLeads(window);

        if (ads.unmatched.length) {
            const list = ads.unmatched
                .slice(0, 20)
                .map((ad) => `• ${ad.name} (${ad.status}, ad ${ad.platformAdId})`)
                .join("\n");
            await slack
                .postMessage({
                    channel: adsWeeklyChannel,
                    text: `🔎 *unmatched*: ${ads.unmatched.length} Meta ad${ads.unmatched.length === 1 ? " has" : "s have"} no LT-ID in the name, so their results can't be joined to a creative:\n${list}${ads.unmatched.length > 20 ? "\n…" : ""}\nRename them "LT-0000 | property-slug | layout" to include them.`,
                })
                .catch((e) => console.error("[adsLoop] unmatched alert failed:", e.message));
        }
        if (ads.unknown.length) {
            await slack
                .postMessage({ channel: adsWeeklyChannel, text: `🔎 Ads use LT-IDs that aren't in the creatives list yet: ${ads.unknown.join(", ")}.` })
                .catch(() => {});
        }

        const summary = `${window.date}: ${ads.matched} creatives with ads, ${ads.unmatched.length} unmatched ads, ${organicRows} organic rows, ${leadRows} LT-ID lead groups`;
        await updateState({ $set: { lastPullAt: new Date(), lastPullSummary: summary } });
        console.log(`[adsLoop] daily pull: ${summary}`);
        return summary;
    } catch (error) {
        console.error("[adsLoop] daily pull failed:", error.message);
        await slack.postMessage({ channel: adsWeeklyChannel, text: `⚠️ Daily metrics pull failed: ${error.message}` }).catch(() => {});
        throw error;
    } finally {
        isRunning = false;
    }
}

module.exports = { runDailyPull, yesterdayWindow };
