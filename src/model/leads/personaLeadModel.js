const mongoose = require("mongoose");

/**
 * Persona-1 hero capture leads. Separate from landingPageLeadModel by design.
 * Persisted on every /api/v1/lead/register submission, with or without consent.
 */
const personaLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    market: { type: String, default: "", trim: true },   // "Austin, TX"
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    buyerType: { type: String, default: "", trim: true },     // hold | wholesale | agent | explore
    dealsClosed: { type: String, default: "", trim: true },   // 0 | 1–3 | 4–10 | 10+

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    marketLive: { type: Boolean, default: false },
    eventId: { type: String, default: "" },

    // FullEnrich reverse-email profile (null when enrichment returns nothing).
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    source: { type: String, default: "persona-1" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("personaLeadModel", personaLeadSchema);