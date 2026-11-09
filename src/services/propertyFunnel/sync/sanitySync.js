// services/propertyFunnel/sync/sanitySync.js
//
// Blog posts from Sanity (project t8hiw68l, dataset production; public, no token) → pf_blog_posts.
// Visits per post come from pf_ga4_page_days (/blogs/<slug>), leads from the lead's landing page.
// Drafts (drafts.* ids) only come back with SANITY_READ_TOKEN; without it only published posts sync.
// Posts that live as files in vihara-next (content/blog) and not in Sanity are not included.

const axios = require("axios");
const PfBlogPost = require("../../../model/propertyFunnel/pfBlogPostModel");

const QUERY = `*[_type=="post" && defined(slug.current)]{_id,title,"slug":slug.current,primaryKeyword,publishedAt,"author":author->name}`;

async function syncSanity() {
  const project = process.env.SANITY_PROJECT_ID || "t8hiw68l";
  const dataset = process.env.SANITY_DATASET || "production";
  const token = process.env.SANITY_READ_TOKEN;
  const { data } = await axios.get(`https://${project}.api.sanity.io/v2023-10-01/data/query/${dataset}`, {
    params: { query: QUERY, perspective: "raw" },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 30000,
  });
  const posts = (data.result || []).filter((p) => p.slug && p.title);
  if (posts.length) {
    await PfBlogPost.bulkWrite(posts.map((p) => ({
      updateOne: {
        filter: { sanityId: p._id },
        update: { $set: {
          title: p.title, slug: p.slug, author: p.author || null, primaryKeyword: p.primaryKeyword || null,
          publishedAt: p.publishedAt ? String(p.publishedAt).slice(0, 10) : null,
          status: String(p._id).startsWith("drafts.") ? "draft" : "published",
        } },
        upsert: true,
      },
    })), { ordered: false });
  }
  return `Sanity "${project}/${dataset}": ${posts.length} posts`;
}

module.exports = { syncSanity };
