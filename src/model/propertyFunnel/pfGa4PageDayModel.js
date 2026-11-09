// model/propertyFunnel/pfGa4PageDayModel.js
//
// Property Funnel: GA4 sessions by date x page x channel group x source/medium x campaign, for /listing/,
// /auction/, /deal and /blog/ pages. Mirrors `ga4_page_days`.
const mongoose = require("mongoose");

const pfGa4PageDaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD (the GA4 property's own timezone)
    pagePath: { type: String, required: true },
    channelGroup: { type: String, required: true }, // sessionDefaultChannelGroup
    sourceMedium: { type: String, default: "" },
    campaign: { type: String, default: "" },
    sessions: { type: Number, required: true },
    engagedSessions: { type: Number, required: true },
    engagementSeconds: { type: Number, required: true },
  },
  { timestamps: true, collection: "pf_ga4_page_days" }
);
pfGa4PageDaySchema.index({ date: 1, pagePath: 1, channelGroup: 1, sourceMedium: 1, campaign: 1 }, { unique: true });

module.exports = mongoose.model("PfGa4PageDay", pfGa4PageDaySchema);
