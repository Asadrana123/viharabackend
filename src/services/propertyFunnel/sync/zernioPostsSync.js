// services/propertyFunnel/sync/zernioPostsSync.js
//
// Organic posts (Instagram, Facebook, LinkedIn, YouTube through Zernio) → pf_social_posts, last 90 days
// (numbers keep growing after a post goes out). Checked against a real response on 9 Nov 2026:
//   GET /v1/analytics?fromDate=&toDate=&limit=100&page=   all platforms in one list, paginated
//   post: _id, platform, publishedAt, content, platformPostUrl, thumbnailUrl, mediaType, isAd, status,
//         analytics { impressions, reach, likes, comments, shares, saves, clicks, views }
// A number the platform doesn't report is stored as null, never 0.
// A post is about a property when its text carries a vihara.ai property link or a listing's street address.

const zernio = require("../../adsLoop/zernioClient");
const PfSocialPost = require("../../../model/propertyFunnel/pfSocialPostModel");
const Product = require("../../../model/property/productModel");
const { pacificDate, addDays, slugFromUrl } = require("../pfCore");

const PLATFORMS = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube" };
const MAX_PAGES = 20;

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function propertyOf(text, listings) {
  for (const url of String(text).match(/https?:\/\/(?:www\.)?vihara\.ai\/\S+/gi) || []) {
    const s = slugFromUrl(url);
    if (s) return s;
  }
  const t = String(text).toLowerCase();
  const hit = listings.find((p) => p.street && p.street.length > 6 && t.includes(p.street.toLowerCase()));
  return hit ? hit.slug : null;
}

function toRow(p, listings) {
  const a = p.analytics || {};
  const parts = ["likes", "comments", "shares", "saves"].filter((k) => typeof a[k] === "number");
  const text = p.content || p.text || "";
  return {
    postId: String(p._id),
    platform: PLATFORMS[String(p.platform || "").toLowerCase()],
    publishedAt: pacificDate(p.publishedAt),
    text: text.slice(0, 2000),
    url: p.platformPostUrl || null,
    thumbnailUrl: p.thumbnailUrl || null,
    propertyId: propertyOf(text, listings),
    impressions: numOrNull(a.impressions),
    reach: numOrNull(a.reach),
    engagement: parts.length ? parts.reduce((s, k) => s + a[k], 0) : null,
    clicks: numOrNull(a.clicks),
    videoViews: String(p.mediaType || "").toLowerCase() === "video" && a.views > 0 ? a.views : null,
  };
}

async function syncZernioPosts({ now = new Date() } = {}) {
  const to = pacificDate(now);
  const from = addDays(to, -89);
  const listings = await Product.find({ slug: { $nin: [null, ""] } }).select("slug street").lean();
  const posts = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await zernio.request("get", "/v1/analytics", { params: { fromDate: from, toDate: to, limit: 100, page, sortBy: "date", order: "desc" } });
    posts.push(...(data.posts || []));
    const pages = data.pagination && data.pagination.pages;
    if (!pages || page >= pages) break;
  }
  const rows = posts
    .filter((p) => !p.isAd && p.status === "published" && p.publishedAt && PLATFORMS[String(p.platform || "").toLowerCase()])
    .map((p) => toRow(p, listings));
  if (rows.length) {
    await PfSocialPost.bulkWrite(rows.map(({ postId, propertyId, ...rest }) => ({
      updateOne: {
        filter: { postId },
        // A property set once (by hand later, or by an earlier run) is kept.
        update: { $set: rest, $setOnInsert: { propertyId } },
        upsert: true,
      },
    })), { ordered: false });
  }
  return `${rows.length} organic posts, last 90 days (${rows.filter((r) => r.propertyId).length} about a property)`;
}

module.exports = { syncZernioPosts, toRow, propertyOf };
