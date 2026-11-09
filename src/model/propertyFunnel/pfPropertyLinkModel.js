// model/propertyFunnel/pfPropertyLinkModel.js
//
// Property Funnel: extra links per property, shown after Listing / Landing form / Register page
// (those three are built from the slug). Mirrors `property_links`.
const mongoose = require("mongoose");

const pfPropertyLinkSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true }, // listing slug
    label: { type: String, required: true },
    url: { type: String, required: true },
    sort: { type: Number, default: 100 },
  },
  { timestamps: true, collection: "pf_property_links" }
);
pfPropertyLinkSchema.index({ propertyId: 1, url: 1 }, { unique: true });

module.exports = mongoose.model("PfPropertyLink", pfPropertyLinkSchema);
