// model/propertyFunnel/pfSocialPostModel.js
//
// Property Funnel: organic posts (Instagram, Facebook, LinkedIn, YouTube) from Zernio, with lifetime
// numbers. null = the platform doesn't report that number, never 0. Mirrors `social_posts`.
const mongoose = require("mongoose");

const pfSocialPostSchema = new mongoose.Schema(
  {
    postId: { type: String, required: true, unique: true }, // Zernio post id
    platform: { type: String, enum: ["Instagram", "Facebook", "LinkedIn", "YouTube"], required: true },
    publishedAt: { type: String, required: true }, // YYYY-MM-DD, Pacific
    text: { type: String, default: "" },
    url: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    propertyId: { type: String, default: null }, // listing slug, if the post names a property
    impressions: { type: Number, default: null },
    reach: { type: Number, default: null },
    engagement: { type: Number, default: null },
    clicks: { type: Number, default: null },
    videoViews: { type: Number, default: null },
  },
  { timestamps: true, collection: "pf_social_posts" }
);
pfSocialPostSchema.index({ publishedAt: 1 });

module.exports = mongoose.model("PfSocialPost", pfSocialPostSchema);
