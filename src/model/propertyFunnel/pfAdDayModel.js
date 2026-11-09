// model/propertyFunnel/pfAdDayModel.js
//
// Property Funnel: daily numbers per Meta ad (Zernio). The last 7 days are pulled again every night
// because Meta revises them. Mirrors `ad_days` in db/property-funnel.sql.
const mongoose = require("mongoose");

const pfAdDaySchema = new mongoose.Schema(
  {
    adId: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD, Pacific
    spend: { type: Number, required: true },
    impressions: { type: Number, required: true },
    clicks: { type: Number, required: true }, // link clicks
    landingPageViews: { type: Number, default: null }, // null = Meta gave no number
    metaLeads: { type: Number, default: null }, // Meta's own lead count
  },
  { timestamps: true, collection: "pf_ad_days" }
);
pfAdDaySchema.index({ adId: 1, date: 1 }, { unique: true });
pfAdDaySchema.index({ date: 1 });

module.exports = mongoose.model("PfAdDay", pfAdDaySchema);
