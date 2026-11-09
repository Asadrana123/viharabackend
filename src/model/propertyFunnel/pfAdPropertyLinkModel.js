// model/propertyFunnel/pfAdPropertyLinkModel.js
//
// Property Funnel: which ads belong to which property (by listing slug). The ads sync adds a row when the
// ad's link carries a slug ("ad link"); marketing adds lead-form and multi-property ads by hand ("manual").
// An ad linked to N properties has its spend split equally. Mirrors `ad_property_map` (+ linked_by).
const mongoose = require("mongoose");

const pfAdPropertyLinkSchema = new mongoose.Schema(
  {
    adId: { type: String, required: true },
    propertyId: { type: String, required: true, trim: true }, // listing slug
    linkedBy: { type: String, enum: ["ad link", "manual"], default: "manual" },
    setBy: { type: String, default: null }, // admin name, for manual links
  },
  { timestamps: true, collection: "pf_ad_property_links" }
);
pfAdPropertyLinkSchema.index({ adId: 1, propertyId: 1 }, { unique: true });
pfAdPropertyLinkSchema.index({ propertyId: 1 });

module.exports = mongoose.model("PfAdPropertyLink", pfAdPropertyLinkSchema);
