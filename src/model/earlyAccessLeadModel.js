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

    // Unique — one registration per email. Duplicate submits are rejected
    // by the controller (E11000 → 409 "already registered").
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    phone: { type: String, required: true, trim: true }, // raw, as entered (for display)

    // Canonical E.164 form of `phone` (via normalisePhone). NOT unique — shared
    // phones are allowed. The daily scheduler dedups on this so the same number
    // is never called twice in one daily cycle.
    phoneNormalized: { type: String, default: "", trim: true },

    markets: { type: String, default: "", trim: true },   // free text: "New York, California, nationwide"
    dealSize: { type: String, default: "", trim: true },  // Under $100K | $100K–$500K | $500K–$1M | $1M+

    // IANA timezone captured silently from the browser at submit
    // (e.g. "America/New_York", "Asia/Kolkata"). Drives the 1:32 PM local callback.
    timezone: { type: String, default: "", trim: true },

    // ── Call retry state (driven by earlyAccessCallScheduler) ─────────────────
    //   pending    → no call resolved yet
    //   no-answer  → last burst went unanswered; a daily 1:32 PM callback is due
    //   connected  → lead picked up; the loop STOPS permanently
    callStatus: {
      type: String,
      enum: ["pending", "no-answer", "connected"],
      default: "pending",
    },
    callAttempts: { type: Number, default: 0 },  // total bursts placed (signup + each daily)
    lastCallAt: { type: Date, default: null },   // when the last burst was dispatched
    nextCallAt: { type: Date, default: null },   // when the next daily burst should fire (UTC)

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

// Scheduler sweep: "find leads whose daily callback is due."
earlyAccessLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

// Fast same-number lookup for the per-day call dedup guard.
earlyAccessLeadSchema.index({ phoneNormalized: 1 });

module.exports = mongoose.model("earlyAccessLeadModel", earlyAccessLeadSchema);
