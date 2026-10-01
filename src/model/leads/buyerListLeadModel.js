const mongoose = require("mongoose");

/**
 * Buyer List leads (/buyer-list page — "Your buy box. Our deal flow.").
 *
 * One record per buyer. Dedup is by email OR phone (controller): a repeat
 * sign-up UPDATES the buy box, contact fields, last touch and attribution, but
 * the ORIGINAL first_touch is never overwritten (credit goes to first touch).
 *
 * Brevo is the CRM source of truth; this collection is the server-side record
 * the page waits on before any ad-platform conversion fires.
 */

// One UTM "touch" (first or last). Stored as sent by the page.
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
    property_type: { type: [String], default: [] }, // sfr | condo | mf_2_4 | mf_5_plus | land
    states: { type: [String], default: [] },        // USPS codes, e.g. ["CA","NY"]
    cities: { type: [String], default: [] },        // free text city / county
    price_min: { type: Number, default: null },
    price_max: { type: Number, default: null },     // null = no upper limit ($3M+)
    match_min: { type: Number, default: null },     // tolerance applied — match deals on these
    match_max: { type: Number, default: null },     // null = no upper limit
    condition: { type: String, default: "", trim: true },  // turnkey | light_rehab | heavy_rehab | any
    financing: { type: String, default: "", trim: true },  // cash | hard_money | mortgage | not_sure
    deals_12mo: { type: String, default: "", trim: true }, // 1 | 2_5 | 6_plus
  },
  { _id: false }
);

const buyerListLeadSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },

    // Raw phone as received (already E.164 via PhoneField.toE164) + canonical form.
    phone: { type: String, required: true, trim: true },
    phoneNormalized: { type: String, default: "", trim: true },

    buyBox: { type: buyBoxSchema, default: () => ({}) },

    // A / B / C — derived from what the buyer told us (recomputed server-side).
    tier: { type: String, enum: ["A", "B", "C"], default: "C" },

    // ── Attribution ─────────────────────────────────────────────────────────
    // firstTouch is set on create and NEVER overwritten on a repeat sign-up.
    firstTouch: { type: touchSchema, default: () => ({}) },
    lastTouch: { type: touchSchema, default: () => ({}) },
    // Raw URL params of the submitting visit (+ variant / type).
    attribution: { type: mongoose.Schema.Types.Mixed, default: {} },
    pageUrl: { type: String, default: "", trim: true },

    // Meta cookies captured at submit, forwarded to the Conversions API.
    fbp: { type: String, default: "", trim: true },
    fbc: { type: String, default: "", trim: true },

    // ── SMS consent (unchecked by default on the form) ──────────────────────
    smsConsent: { type: Boolean, default: false },
    smsConsentText: { type: String, default: "" },
    smsConsentVersion: { type: String, default: "" },
    smsConsentAt: { type: Date, default: null },

    // Shared browser/server dedupe id of the LATEST submission (SIGNUP_EVENT_ID).
    eventId: { type: String, default: "", trim: true },
    submittedAt: { type: Date, default: null },
    submissions: { type: Number, default: 1 },

    // Brevo sync outcome of the latest submission (for retry/reporting).
    brevoSynced: { type: Boolean, default: false },
    brevoError: { type: String, default: "" },

    source: { type: String, default: "buyer-list" },
  },
  { timestamps: true }
);

buyerListLeadSchema.index({ email: 1 }, { unique: true });
buyerListLeadSchema.index({ phoneNormalized: 1 });
buyerListLeadSchema.index({ createdAt: -1 });
buyerListLeadSchema.index({ tier: 1, createdAt: -1 });

module.exports = mongoose.model("buyerListLeadModel", buyerListLeadSchema);
