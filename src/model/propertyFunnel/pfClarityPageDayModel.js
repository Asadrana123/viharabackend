// model/propertyFunnel/pfClarityPageDayModel.js
//
// Property Funnel: Clarity numbers per property page per day. Clarity's API keeps only the last 3 days,
// so these rows are the only history. Mirrors `clarity_page_days`.
const mongoose = require("mongoose");

const pfClarityPageDaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD, Pacific
    url: { type: String, required: true },
    sessions: { type: Number, required: true },
    scrollDepth: { type: Number, default: null }, // average, 0-100
    rageClicks: { type: Number, required: true },
    deadClicks: { type: Number, required: true },
    quickBacks: { type: Number, default: null },
    registerClicks: { type: Number, default: null }, // null until the register_click event exists
  },
  { timestamps: true, collection: "pf_clarity_page_days" }
);
pfClarityPageDaySchema.index({ date: 1, url: 1 }, { unique: true });

module.exports = mongoose.model("PfClarityPageDay", pfClarityPageDaySchema);
