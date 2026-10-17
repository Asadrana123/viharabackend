// model/calling/facetimeSettingsModel.js
//
// FaceTime test settings, a single document (facetimeSettingsService always
// reads/updates with an empty filter). Off by default: until an admin turns it
// on, every call goes out through Vapi exactly as before.
const mongoose = require("mongoose");

const facetimeSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },

    // Who gets FaceTime calls while testing:
    //   "allowlist" - only the numbers below (our own phones), iPhone check skipped
    //   "percent"   - this share of leads we know are on iPhone
    mode: { type: String, enum: ["allowlist", "percent"], default: "allowlist" },
    allowlist: [{ type: String, trim: true }], // stored as digits, e.g. "14155550123"
    percent: { type: Number, default: 0, min: 0, max: 100 },

    // Keeps one Apple ID from looking like a robot to Apple.
    maxCallsPerHourPerLine: { type: Number, default: 15, min: 1 },

    changedAt: { type: Date },
    changedBy: {
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("facetimeSettingsModel", facetimeSettingsSchema);
