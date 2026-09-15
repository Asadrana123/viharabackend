// model/propertyLeadModel.js
//
// ONE lead collection for EVERY property auction landing page (/auction/:slug).
// Replaces the per-property collections (georgiaStLead, rensselaerAveLead, …).
// A lead is stamped with `propertySlug` so a single collection can hold leads for
// any number of properties without a new model per property.
//
// Dedup gate: the COMPOUND unique index { propertySlug, phoneNormalized }.
// That means one registration per phone PER PROPERTY — the same investor can
// still register for two different properties, exactly like the old
// one-collection-per-property design allowed. A duplicate submit for the same
// property is rejected by the controller (E11000 → 409 "already registered").
//
// Everything else mirrors the old single-property schema (call retry state,
// consent, enrichment) so the shared scheduler behaves identically.
const mongoose = require("mongoose");

const propertyLeadSchema = new mongoose.Schema(
  {
    // Which property this lead registered for. Set from the URL slug by the
    // controller (never trusted from the client body). Indexed for the admin
    // tab query and the scheduler sweep.
    propertySlug: { type: String, required: true, trim: true, index: true },

    fullName: { type: String, required: true, trim: true },

    phone: { type: String, required: true, trim: true }, // raw, as entered (display)

    // Canonical E.164 form of `phone` (via normalisePhone). Part of the compound
    // dedup gate below, and the scheduler's per-day call-dedup key.
    phoneNormalized: { type: String, required: true, trim: true },

    // Required (same as the old property pages). NOT the dedup gate — the
    // compound (propertySlug, phoneNormalized) index is.
    email: { type: String, required: true, trim: true, lowercase: true },

    // Cash investor | Owner-occupant | Fix and flip | Buy and hold
    buyerType: { type: String, default: "", trim: true },

    // IANA timezone captured silently from the browser at submit
    // (e.g. "America/Los_Angeles"). Drives the daily local callback.
    timezone: { type: String, default: "", trim: true },

    // ── Call retry state (driven by propertyCallScheduler) ────────────────────
    //   pending    → no call resolved yet
    //   no-answer  → last burst went unanswered; a daily callback is due
    //   connected  → lead picked up; the loop STOPS permanently
    callStatus: {
      type: String,
      enum: ["pending", "no-answer", "connected"],
      default: "pending",
    },
    callAttempts: { type: Number, default: 0 }, // total bursts placed
    lastCallAt: { type: Date, default: null }, // when the last burst was dispatched
    nextCallAt: { type: Date, default: null }, // when the next daily burst should fire (UTC)

    // Admin kill-switch for the daily retry sweep. When true, the scheduler skips
    // this lead entirely. It does NOT touch nextCallAt / callStatus, so flipping
    // it back to false makes the lead eligible for the daily callback again.
    callingStopped: { type: Boolean, default: false },

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    eventId: { type: String, default: "" },

    // FullEnrich reverse-email/phone profile (null when enrichment returns nothing).
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    // Tag for analytics/debugging. Controller sets "auction-<slug>".
    source: { type: String, default: "" },
  },
  { timestamps: true }
);

// One registration per phone PER property (the dedup gate).
propertyLeadSchema.index({ propertySlug: 1, phoneNormalized: 1 }, { unique: true });

// Scheduler sweep: "find leads whose daily callback is due" (per property).
propertyLeadSchema.index({ propertySlug: 1, callStatus: 1, nextCallAt: 1 });
propertyLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

module.exports = mongoose.model("propertyLeadModel", propertyLeadSchema);
