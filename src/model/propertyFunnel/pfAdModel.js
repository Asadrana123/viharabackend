// model/propertyFunnel/pfAdModel.js
//
// Property Funnel (Prajwal's admin tab). One Meta ad, refreshed on every Zernio ads sync. Campaign and
// ad set live here too. Mirrors the `ads` table in his db/property-funnel.sql.
const mongoose = require("mongoose");

const pfAdSchema = new mongoose.Schema(
  {
    adId: { type: String, required: true, unique: true, trim: true }, // Meta ad id (Zernio platformAdId)
    name: { type: String, required: true },
    campaignId: { type: String, required: true },
    campaignName: { type: String, default: "" },
    adSetId: { type: String, required: true, index: true },
    adSetName: { type: String, default: "" },
    audience: { type: String, default: "" }, // one line, from the ad set targeting
    awarenessAuto: { type: String, enum: ["Cold", "Warm", "Hot"], default: "Cold" },
    status: { type: String, enum: ["active", "paused", "ended"], required: true },
    format: { type: String, enum: ["Video", "Image", "Carousel"], required: true },
    linkUrl: { type: String, default: null }, // creative link; the property slug is read from it
    thumbnailUrl: { type: String, default: null },
  },
  { timestamps: true, collection: "pf_ads" }
);

module.exports = mongoose.model("PfAd", pfAdSchema);
