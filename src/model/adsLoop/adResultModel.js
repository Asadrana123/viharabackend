const mongoose = require("mongoose");

// Daily metrics per creative per channel (spec table `results`).
// `raw` keeps the full Zernio response, so a metric added later can be
// backfilled without pulling from Zernio again.

const RESULT_CHANNELS = Object.freeze(["meta_ad", "fb_post", "ig_post"]);

const adResultSchema = new mongoose.Schema(
    {
        ltId: { type: String, required: true },
        date: { type: String, required: true }, // YYYY-MM-DD, ad account time zone
        channel: { type: String, enum: RESULT_CHANNELS, required: true },
        spend: { type: Number, default: null },
        impressions: { type: Number, default: null },
        reach: { type: Number, default: null },
        frequency: { type: Number, default: null },
        clicks: { type: Number, default: null },
        ctr: { type: Number, default: null },
        cpc: { type: Number, default: null },
        cpm: { type: Number, default: null },
        leads: { type: Number, default: null },
        qualifiedLeads: { type: Number, default: null }, // from the backend lead-quality join
        engagements: { type: Number, default: null },
        saves: { type: Number, default: null },
        shares: { type: Number, default: null },
        raw: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { timestamps: true }
);

adResultSchema.index({ ltId: 1, date: 1, channel: 1 }, { unique: true });
adResultSchema.index({ date: 1 });

module.exports = mongoose.model("adResult", adResultSchema);
module.exports.RESULT_CHANNELS = RESULT_CHANNELS;
