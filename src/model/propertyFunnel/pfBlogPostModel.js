// model/propertyFunnel/pfBlogPostModel.js
//
// Property Funnel: blog posts from Sanity (project t8hiw68l, dataset production). Mirrors `blog_posts`.
const mongoose = require("mongoose");

const pfBlogPostSchema = new mongoose.Schema(
  {
    sanityId: { type: String, required: true, unique: true }, // Sanity _id (drafts.* = draft)
    title: { type: String, required: true },
    slug: { type: String, required: true },
    author: { type: String, default: null },
    primaryKeyword: { type: String, default: null },
    publishedAt: { type: String, default: null }, // YYYY-MM-DD
    status: { type: String, enum: ["published", "draft"], required: true },
  },
  { timestamps: true, collection: "pf_blog_posts" }
);

module.exports = mongoose.model("PfBlogPost", pfBlogPostSchema);
