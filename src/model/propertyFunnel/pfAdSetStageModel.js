// model/propertyFunnel/pfAdSetStageModel.js
//
// Property Funnel: marketing's override of an ad set's automatic Cold / Warm / Hot. Mirrors `ad_set_stage`.
const mongoose = require("mongoose");

const pfAdSetStageSchema = new mongoose.Schema(
  {
    adSetId: { type: String, required: true, unique: true },
    awareness: { type: String, enum: ["Cold", "Warm", "Hot"], required: true },
    setBy: { type: String, default: null },
    setAt: { type: Date, default: Date.now },
  },
  { collection: "pf_ad_set_stages" }
);

module.exports = mongoose.model("PfAdSetStage", pfAdSetStageSchema);
