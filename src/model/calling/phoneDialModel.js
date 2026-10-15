// model/phoneDialModel.js
const mongoose = require("mongoose");

/**
 * One row per phone number we have ever dialed — when Maya last called it.
 * Powers the "one call per person per day" rule (services/calling/dailyDialGuard):
 * every system that dials (sign-up follow-ups, Buyer Match, campaigns) checks
 * this before calling, so a person who didn't pick up is not rung again the
 * same day by a different loop.
 *
 * Written at DIAL time (callLogModel is only written when the call ends, which
 * is too late to stop a second dial).
 */
const phoneDialSchema = new mongoose.Schema(
  {
    // Digits only, with country code ("14155550123", "919876543210").
    phone: { type: String, required: true, trim: true },
    lastDialAt: { type: Date, required: true },
    source: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

phoneDialSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model("phoneDialModel", phoneDialSchema);
