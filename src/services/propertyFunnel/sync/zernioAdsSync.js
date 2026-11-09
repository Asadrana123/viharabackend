// services/propertyFunnel/sync/zernioAdsSync.js
//
// Meta ads (through Zernio) → pf_ads, pf_ad_days, pf_ad_property_links ("ad link" rows).
// Field names checked against real responses on 9 Nov 2026:
//   GET /v1/ads/tree?accountId=&fromDate=&toDate=&page=   campaigns → adSets → ads, 20 campaigns a page
//     ad: _id (Zernio id, for analytics), platformAdId (Meta ad id), name, status, creativeType,
//         creative.linkUrl, creative.thumbnailUrl, platformCampaignId, platformAdSetId, metrics.spend
//     ad set: platformAdSetId, adSetName. No targeting in the tree, so Cold / Warm / Hot comes from
//     the ad set's name (marketing overrides it in pf_ad_set_stages).
//   GET /v1/ads/{_id}/analytics?fromDate=&toDate=   analytics.daily[]: date, spend, impressions,
//     actions.link_click, funnel.landingPageViews, funnel.leads
// Lead-form and /find or /new-deals ads carry no property slug: marketing links them by hand.

const zernio = require("../../adsLoop/zernioClient");
const { getAdsLoopConfig } = require("../../../config/adsLoop/adsLoopConfig");
const PfAd = require("../../../model/propertyFunnel/pfAdModel");
const PfAdDay = require("../../../model/propertyFunnel/pfAdDayModel");
const PfAdPropertyLink = require("../../../model/propertyFunnel/pfAdPropertyLinkModel");
const { pacificDate, addDays, slugFromUrl } = require("../pfCore");

const MAX_PAGES = 20; // 400 campaigns: far more than the account has

const numOrNull = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

function formatOf(ad) {
  const t = String(ad.creativeType || ad.platformCreativeType || (ad.creative && ad.creative.objectType) || "").toLowerCase();
  if (t.includes("carousel")) return "Carousel";
  if (t.includes("video") || (ad.creative && (ad.creative.videoId || ad.creative.video))) return "Video";
  return "Image";
}

function statusOf(ad) {
  const s = String(ad.status || "").toLowerCase();
  if (s === "active") return "active";
  if (["deleted", "archived", "completed", "ended"].includes(s)) return "ended";
  return "paused";
}

/**
 * Cold / Warm / Hot from the ad set's name, since Zernio doesn't return targeting. Our ad sets are named
 * after their audience ("SF +15mi - Broad - ...", "NOLA page visitors 180d", "Leads list ...").
 */
function awarenessFromName(name) {
  const n = String(name || "").toLowerCase();
  if (/(customer|leads? list|lead list|our leads|signed[- ]?up|users|crm|hot)/.test(n)) return "Hot";
  if (/(retarget|visitor|viewers?|engag|video view|warm|\b\d+d\b)/.test(n)) return "Warm";
  return "Cold";
}

async function treePages(params) {
  const campaigns = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await zernio.request("get", "/v1/ads/tree", { params: { ...params, page } });
    campaigns.push(...(data.campaigns || []));
    const pages = data.pagination && data.pagination.pages;
    if (!pages || page >= pages) break;
  }
  return campaigns;
}

async function syncZernioAds({ days = 2, now = new Date() } = {}) {
  const { adsAccountId, adAccountId } = getAdsLoopConfig().zernio;
  const to = pacificDate(now);
  const from = addDays(to, -(days - 1));
  const campaigns = await treePages({ accountId: adsAccountId || undefined, adAccountId, fromDate: from, toDate: to });

  let adCount = 0, dayCount = 0, linked = 0;
  for (const c of campaigns) {
    if (c.platform && c.platform !== "facebook" && c.platform !== "instagram" && c.platform !== "meta") continue;
    for (const s of c.adSets || []) {
      for (const a of s.ads || []) {
        const adId = String(a.platformAdId || a._id);
        const link = (a.creative && a.creative.linkUrl) || null;
        await PfAd.updateOne(
          { adId },
          {
            $set: {
              name: a.name || adId,
              campaignId: String(c.platformCampaignId || a.platformCampaignId || ""),
              campaignName: c.campaignName || "",
              adSetId: String(s.platformAdSetId || a.platformAdSetId || ""),
              adSetName: s.adSetName || "",
              audience: s.adSetName || "",
              awarenessAuto: awarenessFromName(s.adSetName),
              status: statusOf(a),
              format: formatOf(a),
              linkUrl: link,
              thumbnailUrl: (a.creative && a.creative.thumbnailUrl) || null,
            },
          },
          { upsert: true }
        );
        adCount++;

        // Link to the property in the ad's URL. Never touches a link marketing made by hand.
        const slug = slugFromUrl(link);
        if (slug) {
          const r = await PfAdPropertyLink.updateOne({ adId, propertyId: slug }, { $setOnInsert: { linkedBy: "ad link" } }, { upsert: true });
          if (r.upsertedCount) linked++;
        }

        if (!(Number((a.metrics && a.metrics.spend) || 0) > 0)) continue;
        const an = await zernio.request("get", `/v1/ads/${a._id}/analytics`, { params: { fromDate: from, toDate: to } });
        const daily = (an.analytics && an.analytics.daily) || an.daily || [];
        const ops = daily
          .filter((d) => d && d.date)
          .map((d) => ({
            updateOne: {
              filter: { adId, date: String(d.date).slice(0, 10) },
              update: {
                $set: {
                  spend: Number(d.spend || 0),
                  impressions: Number(d.impressions || 0),
                  clicks: Number((d.actions && d.actions.link_click) ?? (d.engagementBreakdown && d.engagementBreakdown.linkClicks) ?? 0),
                  landingPageViews: numOrNull(d.funnel && d.funnel.landingPageViews),
                  metaLeads: numOrNull(d.funnel && d.funnel.leads),
                },
              },
              upsert: true,
            },
          }));
        if (ops.length) await PfAdDay.bulkWrite(ops, { ordered: false });
        dayCount += ops.length;
      }
    }
  }
  return `Meta ad account: ${adCount} ads, ${dayCount} ad-days, ${linked} new property links (${from} to ${to})`;
}

module.exports = { syncZernioAds, awarenessFromName, formatOf, statusOf };
