// model/sendify/sendifySettingsModel.js
//
// Global Sendify settings — a single document (sendifySettingsService.js
// always queries/updates with an empty filter, upserting on first use), not
// one row per admin or per property. Starts with just quiet-hours on/off;
// more global toggles can land here later without a new collection.
const mongoose = require("mongoose");

const sendifySettingsSchema = new mongoose.Schema(
  {
    // Default hours of the day quiet-hours policy are enforced in. When false,
    // sendifyQuietHoursService.checkQuietHours lets every message through
    // immediately — an admin override for testing or an urgent send, not a
    // replacement for the policy.
    quietHoursEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("sendifySettingsModel", sendifySettingsSchema);
