// model/property/renovationContractorRequestModel.js
//
// A lead captured from the renovation tool's "Get Contractors & Vendors"
// button — separate from the old contractors block, which only served a
// static list and never took submissions. `requestType` is a fixed literal
// so anyone looking at a raw record (or a future admin list) can tell at a
// glance this came from the renovation tool asking about contractors/
// vendors, not from the property-auction registration funnel or the plain
// Contact Us form.

const mongoose = require("mongoose");

const renovationContractorRequestSchema = new mongoose.Schema(
  {
    requestType: { type: String, default: "renovation-contractors-vendors", immutable: true },

    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "productModel",
      required: [true, "propertyId is required"],
      index: true,
    },
    // Optional link to the specific renovation visualization this came from.
    renovationRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "renovationRequest",
      default: null,
    },
    // Which area (Kitchen, Bathroom, ...) they were viewing when they asked, if known.
    selectedArea: { type: String, default: "", trim: true },

    name: { type: String, required: [true, "Name is required"], trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"],
    },
    phone: { type: String, required: [true, "Phone is required"], trim: true },

    // Set when the requester is logged in; anonymous submissions are allowed
    // (matches the renovation tool itself, which doesn't require login).
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", default: null },

    consent: { type: Boolean, required: true },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

renovationContractorRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("renovationContractorRequestModel", renovationContractorRequestSchema);
