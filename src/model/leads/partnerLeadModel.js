// model/partnerLeadModel.js
//
// Partner Program applicant (realtors / flippers / wholesalers / funds who bring
// buyers). Mirrors the property-page lead models (georgiaStLeadModel /
// rensselaerAveLeadModel) but is anchored to the PARTNER APPLICATION flow, not a
// single auction:
//
//   • Identity is firstName + lastName (not one fullName), plus primaryMarket and
//     persona (the exact label the applicant picked on the page).
//   • DEDUP GATE is EMAIL (unique) — agents are email-identified and may apply
//     from different phone numbers. Phone is NOT the unique key here.
//   • phoneNormalized is kept ONLY for dialing the Maya recruit call; it carries a
//     plain (non-unique) index for the scheduler's same-number lookups.
//
// The call-state fields (callStatus / nextCallAt / callAttempts / lastCallAt) are
// the exact contract partnerCallScheduler.js drives. Do NOT rename them without
// updating the scheduler.

const mongoose = require("mongoose");

const partnerLeadSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },

    // Dedup gate — unique. Always stored lowercase + trimmed (see controller and
    // the schema-level lowercase/trim below). `unique: true` already builds the
    // index, so we do NOT add a separate `index: true` (avoids a duplicate-index
    // warning from Mongoose).
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    // Raw phone as entered (display) + canonical E.164 for dialing (not unique).
    phone:           { type: String, required: true, trim: true },
    phoneNormalized: { type: String, trim: true, default: "", index: true },

    // ── Partner buy-box ───────────────────────────────────────────────────
    primaryMarket: { type: String, trim: true, default: "" },
    persona:       { type: String, trim: true, default: "" }, // exact page label

    // Silent IANA timezone read from the browser — drives the local callback
    // scheduling (1:32 PM in the applicant's own zone).
    timezone: { type: String, trim: true, default: "" },

    // ── Consent (TCPA trail) ──────────────────────────────────────────────
    consent:          { type: Boolean, default: false },
    consentText:      { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    // Client-generated id for Meta / GTM event correlation and idempotency.
    eventId: { type: String, default: "" },

    // ── Enrichment (FullEnrich; filled in the background, never blocks signup) ─
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Maya call state (owned by partnerCallScheduler.js) ────────────────
    // pending   → created, no call outcome yet (also: no-consent leads stay here)
    // no-answer → burst didn't connect; nextCallAt holds the next 1:32 PM local
    // connected → a human picked up; loop STOPS for this number
    callStatus: {
      type: String,
      enum: ["pending", "no-answer", "connected"],
      default: "pending",
    },
    nextCallAt:   { type: Date, default: null },
    callAttempts: { type: Number, default: 0 },
    lastCallAt:   { type: Date, default: null },

    // Admin kill-switch for the daily retry sweep. When true, partnerCallScheduler
    // skips this lead entirely. It does NOT touch nextCallAt / callStatus, so
    // flipping it back to false makes the lead eligible for the daily callback again.
    callingStopped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Daily sweep hits { callStatus: "no-answer", nextCallAt: { $lte: now } } sorted
// by nextCallAt — this compound index keeps that query cheap as leads grow.
partnerLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

module.exports = mongoose.model("PartnerLead", partnerLeadSchema);
