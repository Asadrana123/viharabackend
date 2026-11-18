// model/marketing/creativeEstimateRecordModel.js
const mongoose = require("mongoose");

/**
 * One estimate made on the Studio's Estimate page (vihara.ai/studio/estimate): what was checked,
 * what the tool guessed, and, once someone links it to the real Meta ad, what really happened.
 * Kept so we can see how often the guesses are right.
 */
const fileSchema = new mongoose.Schema(
    {
        // Where the file is in the private bucket. Never sent to a browser.
        key: { type: String, required: true },
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
        bytes: { type: Number, required: true },
    },
    { _id: false }
);

const creativeEstimateSchema = new mongoose.Schema(
    {
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true },
        byName: { type: String, required: true },
        title: { type: String, default: "" },
        format: { type: String, enum: ["video", "image", "carousel"], required: true },
        leadPlace: { type: String, enum: ["meta_form", "website"], required: true },
        buyerType: { type: String, default: null },
        state: { type: String, default: null },
        dailyBudget: { type: Number, required: true },
        days: { type: Number, required: true },
        adText: { type: String, default: "" },
        // A Studio video it came from (its core id), when it did.
        studioCoreId: { type: String, default: null },
        files: { type: [fileSchema], default: [] },
        // The numbers as shown on the page (creativeEstimateModel.buildEstimate).
        estimate: { type: mongoose.Schema.Types.Mixed, default: null },
        // The AI's check of the creative (creativeReviewService.reviewCreative), or null when it failed.
        review: { type: mongoose.Schema.Types.Mixed, default: null },
        // The check runs after the numbers are shown; a restart mid-check leaves "pending", which
        // the page treats as failed after a while (creativeEstimateService.REVIEW_STALE_MS).
        reviewState: { type: String, enum: ["pending", "done", "failed"], default: "pending" },
        reviewError: { type: String, default: null },
        // The real Meta ad it became, when someone links it.
        linkedAd: {
            adId: { type: String, default: null },
            name: { type: String, default: null },
            byName: { type: String, default: null },
            at: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

creativeEstimateSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("CreativeEstimate", creativeEstimateSchema);
