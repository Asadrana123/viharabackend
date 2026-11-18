// model/marketing/creativeAdTagModel.js
const mongoose = require("mongoose");

/**
 * Our tags on one past Meta ad, for the Studio's Estimate page: which buyer the ad spoke to and
 * which US state its property is in. Meta does not know these, so an AI reads the ad's own text
 * once (services/marketing/creativeReviewService.js) and the answer is kept here. An admin can
 * correct a tag; a corrected tag is never overwritten by the AI again.
 */
const creativeAdTagSchema = new mongoose.Schema(
    {
        // Meta's ad id (Zernio's platformAdId).
        adId: { type: String, required: true, unique: true },
        // One of the Studio's buyer types (services/studio/runService.js BUYER_TYPES), or null when unclear.
        buyerType: { type: String, default: null },
        // Two-letter US state, or null.
        state: { type: String, default: null },
        source: { type: String, enum: ["ai", "admin"], default: "ai" },
        model: { type: String, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("CreativeAdTag", creativeAdTagSchema);
