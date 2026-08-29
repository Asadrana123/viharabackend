const mongoose = require("mongoose");

/**
 * Northern California early-access leads (/northern-california-early-access page).
 *
 * Store-only funnel by design — this page does NOT trigger the Maya call, Brevo
 * sync, or enrichment. It simply persists the buyer's details so the team can
 * follow up manually. Kept in its own collection so it never mixes with the
 * Early Access / property / partner funnels.
 */
const norCalLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },

    // Unique — one registration per email. Duplicate submits are rejected by the
    // controller (E11000 → 409 "already registered").
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    // Stored as received from the client (already E.164 via PhoneField.toE164).
    phone: { type: String, required: true, trim: true },

    // Self-ID pill from the page: Individual Investor | Buy & Hold |
    // Volume Flipper | Fund Operator.
    buyerType: { type: String, default: "", trim: true },

    // Market is fixed for this page but stored explicitly for reporting.
    market: { type: String, default: "Northern California", trim: true },

    // IANA timezone captured silently from the browser at submit
    // (e.g. "America/Los_Angeles"). Kept for future use / reporting.
    timezone: { type: String, default: "", trim: true },

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    // Client pixel de-dupe id (client GTM/Meta only; no server CAPI here).
    eventId: { type: String, default: "" },

    source: { type: String, default: "northern-california-early-access" },
  },
  { timestamps: true }
);

// Newest-first admin listing / exports.
norCalLeadSchema.index({ createdAt: -1 });

module.exports = mongoose.model("norCalLeadModel", norCalLeadSchema);
