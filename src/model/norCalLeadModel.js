const mongoose = require("mongoose");

/**
 * Northern California early-access leads (/northern-california-early-access page).
 *
 * Full funnel — on registration this page triggers the Maya signup call, the
 * daily callback loop, FullEnrich enrichment, and a Brevo sync to the dedicated
 * NorCal list (BREVO_NORCAL_LIST_ID). Kept in its own collection so it never
 * mixes with the Early Access / property / partner funnels.
 *
 * Dedup gate is the unique email index (one registration per email) — a
 * duplicate submit is rejected by the controller (E11000 -> 409 "already
 * registered"). Phones are NOT unique (shared numbers are allowed); the daily
 * scheduler dedups on phoneNormalized so the same number is never called twice
 * in one sweep.
 */
const norCalLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },

    // Unique — one registration per email. Duplicate submits are rejected by the
    // controller (E11000 -> 409 "already registered").
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    // Raw phone, as received from the client (already E.164 via PhoneField.toE164).
    phone: { type: String, required: true, trim: true },

    // Canonical E.164 form of `phone` (via normalisePhone). NOT unique — shared
    // phones are allowed. The scheduler dials this and dedups on it per sweep.
    phoneNormalized: { type: String, default: "", trim: true },

    // Self-ID pill from the page: Individual Investor | Buy & Hold |
    // Volume Flipper | Fund Operator.
    buyerType: { type: String, default: "", trim: true },

    // Market is fixed for this page but stored explicitly for reporting.
    market: { type: String, default: "Northern California", trim: true },

    // IANA timezone captured silently from the browser at submit
    // (e.g. "America/Los_Angeles"). Drives the daily local callback slots.
    timezone: { type: String, default: "", trim: true },

    // ── Call retry state (driven by norCalCallScheduler) ──────────────────────
    //   pending    -> no call resolved yet
    //   no-answer  -> last burst went unanswered; a daily callback is due
    //   connected  -> lead picked up; the loop STOPS permanently
    callStatus: {
      type: String,
      enum: ["pending", "no-answer", "connected"],
      default: "pending",
    },
    callAttempts: { type: Number, default: 0 },  // total bursts placed (signup + each daily)
    lastCallAt: { type: Date, default: null },   // when the last burst was dispatched
    nextCallAt: { type: Date, default: null },   // when the next daily burst should fire (UTC)

    // Admin kill-switch for the daily retry sweep. When true, the scheduler skips
    // this lead entirely. It does NOT touch nextCallAt / callStatus, so flipping
    // it back to false makes the lead eligible for the daily callback again —
    // fully reversible.
    callingStopped: { type: Boolean, default: false },

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    // Client pixel de-dupe id (client GTM/Meta only; no server CAPI here).
    eventId: { type: String, default: "" },

    // FullEnrich reverse-email profile (null when enrichment returns nothing).
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    source: { type: String, default: "northern-california-early-access" },
  },
  { timestamps: true }
);

// Newest-first admin listing / exports.
norCalLeadSchema.index({ createdAt: -1 });

// Scheduler sweep: "find leads whose daily callback is due."
norCalLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

// Fast same-number lookup for the per-sweep call dedup guard.
norCalLeadSchema.index({ phoneNormalized: 1 });

module.exports = mongoose.model("norCalLeadModel", norCalLeadSchema);
