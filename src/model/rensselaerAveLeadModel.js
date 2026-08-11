// model/rensselaerAveLeadModel.js
const mongoose = require("mongoose");

/**
 * Auction-registration leads for the 401 Rensselaer Ave, Ogdensburg landing page
 * (Meta ad traffic → /auction/449-rensselaer-ave).
 *
 * Separate collection by design — this page collects a buyer-type band and an
 * OPTIONAL email (unlike early access, where email is required + the dedup gate).
 * Because email is optional here, the dedup gate is `phoneNormalized` (unique):
 * one registration per phone number for this property. A duplicate submit is
 * rejected by the controller (E11000 → 409 "already registered").
 *
 * Persisted on every /api/v1/rensselaer-ave/register submission.
 */
const rensselaerAveLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },

    phone: { type: String, required: true, trim: true }, // raw, as entered (for display)

    // Canonical E.164 form of `phone` (via normalisePhone). UNIQUE — this is the
    // registration dedup gate for this property, and the scheduler's per-day
    // call-dedup key.
    phoneNormalized: { type: String, required: true, unique: true, trim: true },

    // Required (same as early access). NOT the dedup gate — phoneNormalized is,
    // since one registration per phone is the rule for this single-property page.
    email: { type: String, required: true, trim: true, lowercase: true },

    // Cash investor | Owner-occupant | Fix and flip | Buy and hold
    buyerType: { type: String, default: "", trim: true },

    // IANA timezone captured silently from the browser at submit
    // (e.g. "America/Los_Angeles"). Drives the daily local callback.
    timezone: { type: String, default: "", trim: true },

    // ── Call retry state (driven by rensselaerAveCallScheduler) ───────────────────
    //   pending    → no call resolved yet
    //   no-answer  → last burst went unanswered; a daily callback is due
    //   connected  → lead picked up; the loop STOPS permanently
    callStatus: {
      type: String,
      enum: ["pending", "no-answer", "connected"],
      default: "pending",
    },
    callAttempts: { type: Number, default: 0 },  // total bursts placed
    lastCallAt: { type: Date, default: null },   // when the last burst was dispatched
    nextCallAt: { type: Date, default: null },   // when the next daily burst should fire (UTC)

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    eventId: { type: String, default: "" },

    // FullEnrich reverse-email/phone profile (null when enrichment returns nothing).
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    // Hardcoded property marker — this collection only ever holds 401 Rensselaer Ave
    // leads, but we stamp it so the admin tab / future queries stay explicit.
    propertySlug: { type: String, default: "449-rensselaer-ave", trim: true },

    source: { type: String, default: "auction-449-rensselaer-ave" },
  },
  { timestamps: true }
);

// Scheduler sweep: "find leads whose daily callback is due."
rensselaerAveLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

module.exports = mongoose.model("rensselaerAveLeadModel", rensselaerAveLeadSchema);
