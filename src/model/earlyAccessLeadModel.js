const mongoose = require("mongoose");

/**
 * Early-access buyer-list leads (/early-access page).
 * Separate collection from personaLeadModel by design — this page collects a
 * free-text market string + a deal-size band, not the persona buyer-type/deals fields.
 * Persisted on every /api/v1/early-access/register submission.
 */
const earlyAccessLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    markets: { type: String, default: "", trim: true },   // free text: "New York, California, nationwide"
    dealSize: { type: String, default: "", trim: true },  // Under $100K | $100K–$500K | $500K–$1M | $1M+

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    eventId: { type: String, default: "" },

    // FullEnrich reverse-email profile (null when enrichment returns nothing).
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    source: { type: String, default: "early-access" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("earlyAccessLeadModel", earlyAccessLeadSchema);
