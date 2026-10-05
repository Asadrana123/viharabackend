const mongoose = require("mongoose");

/**
 * New Deals leads (/new-deals — "A new deal just landed.").
 *
 * Buy-box sign-ups from the static deal spotlight (Baltimore, PG County, Metro
 * Detroit, New Orleans). Same shape as the Buyer List record plus the call
 * flow: with consent, Maya calls on signup and retries daily (11:00 / 2:30 /
 * 6:00 local) until someone picks up — see newDealsCallScheduler.
 *
 * Dedup is by email OR phone (controller): a repeat sign-up UPDATES the buy
 * box, contact and last touch but never the ORIGINAL first touch.
 */

const touchSchema = new mongoose.Schema(
  {
    utm_source: { type: String, default: "", trim: true },
    utm_medium: { type: String, default: "", trim: true },
    utm_campaign: { type: String, default: "", trim: true },
    utm_term: { type: String, default: "", trim: true },
    utm_content: { type: String, default: "", trim: true },
    gclid: { type: String, default: "", trim: true },
    fbclid: { type: String, default: "", trim: true },
    ts: { type: Date, default: null },
  },
  { _id: false }
);

const buyBoxSchema = new mongoose.Schema(
  {
    strategy: { type: [String], default: [] },      // flip | rent | brrrr | wholesale | home
    property_type: { type: [String], default: [] }, // sfr | condo | mf_2_4 | mf_5_plus | mixed_use
    states: { type: [String], default: [] },
    cities: { type: [String], default: [] },
    price_min: { type: Number, default: null },
    price_max: { type: Number, default: null },     // null = no upper limit ($3M+)
    match_min: { type: Number, default: null },
    match_max: { type: Number, default: null },
    condition: { type: String, default: "", trim: true },
    financing: { type: String, default: "", trim: true },
    deals_12mo: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const newDealsLeadSchema = new mongoose.Schema(
  {
    // The form asks for a full name; first/last are split from it (Brevo
    // FIRSTNAME / LASTNAME, Maya's greeting).
    fullName: { type: String, default: "", trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: "", trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    phoneNormalized: { type: String, default: "", trim: true },

    buyBox: { type: buyBoxSchema, default: () => ({}) },
    tier: { type: String, enum: ["A", "B", "C"], default: "C" },

    // Spotlight deal they tapped ("bal-01" …) — see NEW_DEALS in landing.config.
    dealInterest: { type: String, default: "", trim: true },
    contactPreference: { type: String, enum: ["", "email", "text", "call"], default: "" },
    // Legacy: the "advisor call" checkbox was removed from the form (Maya
    // connects to an advisor on request). Kept so older records still read.
    advisorCallRequested: { type: Boolean, default: false },

    // ── Contact consent (calls incl. Maya + texts). Optional on the form. ────
    // No consent → lead is saved but never called.
    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentVersion: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    // IANA timezone from the browser — drives the daily callback slots.
    timezone: { type: String, default: "", trim: true },

    // ── Call retry state (driven by newDealsCallScheduler) ───────────────────
    callStatus: { type: String, enum: ["pending", "no-answer", "connected", "not-reached"], default: "pending" },
    callAttempts: { type: Number, default: 0 },
    lastCallAt: { type: Date, default: null },
    nextCallAt: { type: Date, default: null },
    // Start of the 7-day follow-up window (admin "Restart calling"); else createdAt.
    followUpStartedAt: { type: Date, default: null },
    // Admin kill-switch for the daily sweep (reversible).
    callingStopped: { type: Boolean, default: false },

    // ── Attribution ──────────────────────────────────────────────────────────
    firstTouch: { type: touchSchema, default: () => ({}) },
    lastTouch: { type: touchSchema, default: () => ({}) },
    attribution: { type: mongoose.Schema.Types.Mixed, default: {} },
    pageUrl: { type: String, default: "", trim: true },
    fbp: { type: String, default: "", trim: true },
    fbc: { type: String, default: "", trim: true },

    eventId: { type: String, default: "", trim: true },
    submittedAt: { type: Date, default: null },
    submissions: { type: Number, default: 1 },

    brevoSynced: { type: Boolean, default: false },
    brevoError: { type: String, default: "" },

    // Welcome email (Brevo template 189) — sent ONCE per person, after the
    // contact is saved. A repeat sign-up never re-sends it.
    welcomeEmailSentAt: { type: Date, default: null },
    welcomeEmailMessageId: { type: String, default: "" },
    welcomeEmailError: { type: String, default: "" },

    source: { type: String, default: "new-deals" },
  },
  { timestamps: true }
);

newDealsLeadSchema.index({ email: 1 }, { unique: true });
newDealsLeadSchema.index({ phoneNormalized: 1 });
newDealsLeadSchema.index({ createdAt: -1 });
newDealsLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

module.exports = mongoose.model("newDealsLeadModel", newDealsLeadSchema);
