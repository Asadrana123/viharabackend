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
const { formAnswerSchemaDef } = require("../../services/leads/formAnswers");

// One UTM "touch" (first or last), as sent by the page. utm_content carries the
// Meta Ads Loop creative id (LT-0004) for leads that came from an ad.
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
    needsFinancing: { type: String, default: "", trim: true }, // yes | no | not_sure
    // Planned down payment, only when needsFinancing is "yes":
    // Under 10% | 10-20% | 20-30% | 30% or more | Not sure ("" otherwise).
    downPayment: { type: String, default: "", trim: true },
    // /deal form, financing buyers only (services/leads/buyBox.js): the loan they need and whether they're
    // pre-approved. residential = home loan (our bank partner); dscr | fix_flip | other need an investor lender.
    loanType: { type: String, default: "", trim: true }, // residential | dscr | fix_flip | other | ""
    loanTypeOther: { type: String, default: "", trim: true }, // their words when loanType is "other" (max 120)
    preApproved: { type: Boolean, default: null }, // true | false for financing buyers; null otherwise

    // Buyer's quoted price (Quote Your Price funnel), in whole dollars. Set from
    // the client's slider (estimate +/- 30%, or fixed numbers for some properties;
    // see quoteBounds in the website's landing.helpers.js). It can be below startBid.
    // null when the lead did not quote a price (no slider on the page).
    quotePrice: { type: Number, default: null },

    // IANA timezone captured silently from the browser at submit
    // (e.g. "America/Los_Angeles"). Drives the daily local callback.
    timezone: { type: String, default: "", trim: true },

    // ── Call retry state (driven by propertyCallScheduler) ────────────────────
    //   pending    → no call resolved yet
    //   no-answer  → last burst went unanswered; a daily callback is due
    //   connected  → lead picked up; the loop STOPS permanently
    //   not-reached → 7 follow-up days with no pickup; calling stopped (admin decides)
    callStatus: {
      type: String,
      enum: ["pending", "no-answer", "connected", "not-reached"],
      default: "pending",
    },
    callAttempts: { type: Number, default: 0 }, // total bursts placed
    lastCallAt: { type: Date, default: null }, // when the last burst was dispatched
    nextCallAt: { type: Date, default: null }, // when the next daily burst should fire (UTC)
    // Start of the 7-day follow-up window (admin "Restart calling"); else createdAt.
    followUpStartedAt: { type: Date, default: null },

    // Admin kill-switch for the daily retry sweep. When true, the scheduler skips
    // this lead entirely. It does NOT touch nextCallAt / callStatus, so flipping
    // it back to false makes the lead eligible for the daily callback again.
    callingStopped: { type: Boolean, default: false },

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },

    // ── SMS consent (separate, unchecked-by-default box on the form) ─────────
    // smsConsentAt is stamped by the SERVER when the box is ticked. Drives
    // SMS_OPT_IN / SMS_OPT_IN_AT on the Brevo contact; Brevo sends the texts.
    smsConsent: { type: Boolean, default: false },
    smsConsentText: { type: String, default: "" },
    smsConsentAt: { type: Date, default: null },

    eventId: { type: String, default: "" },
    // Extra questions added to the form in Admin → Landing Pages: [{ question, answer }].
    extraAnswers: formAnswerSchemaDef,

    // FullEnrich reverse-email/phone profile (null when enrichment returns nothing).
    enrichment: { type: mongoose.Schema.Types.Mixed, default: null },

    // Tag for analytics/debugging. Controller sets "auction-<slug>".
    source: { type: String, default: "" },

    // Where the lead came from (UTM params). firstTouch = first visit in the
    // page's attribution window, lastTouch = the visit that registered.
    firstTouch: { type: touchSchema, default: () => ({}) },
    lastTouch: { type: touchSchema, default: () => ({}) },

    // Created by the QA agent (request carried the QA agent token). Such leads
    // never get calls, Slack posts, enrichment, Brevo sync or texts, are hidden
    // from admin lead lists and Buyer Match, and are deleted by QA cleanup.
    isQaTest: { type: Boolean, default: false },

    // ── /deal form: the private deal sheet (config/dealSheet.js, services/dealSheet/) ──────────────
    // "deal" for sign-ups from the /deal form; "" for /auction/:slug and the finder.
    form: { type: String, default: "", trim: true },
    // What they'd do with it (live_in | rental | house_hack | fix_flip) and when they're ready to buy
    // (30d = now, at this sale | 90d | 180d | looking). "" when not asked.
    purpose: { type: String, default: "", trim: true },
    timeline: { type: String, enum: ["", "30d", "90d", "180d", "looking"], default: "" },
    // Short code shown on the sheet and used in the booking link (vihara.ai/b/<ref>), e.g. "VH-8F2K".
    ref: { type: String, default: undefined, trim: true },
    // Secret the form gets back at sign-up; the phone / email endpoints need it (a lead id alone isn't enough).
    accessKey: { type: String, default: "", select: false },
    // The number is confirmed: the texted code was entered ("code") or the texted link was opened ("sms_link").
    phoneVerifiedAt: { type: Date, default: null },
    phoneVerifyMethod: { type: String, enum: ["", "code", "sms_link"], default: "" },
    // The /deal sign-up call: placed once, when the number is confirmed, or 30 minutes after sign-up without it
    // (then signupCallUnverified = true, the call task's "phone_unverified" flag).
    signupCallAt: { type: Date, default: null },
    signupCallUnverified: { type: Boolean, default: false },
    // "Change number" to a number that already has a lead for this deal: the code confirms that lead, and this
    // one points at it (no calls of its own).
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, default: null },
    dealSheet: {
      token: { type: String, default: undefined }, // vihara.ai/s/<token>
      marker: { type: String, default: "" }, // ?v=<marker> on the texted link only: opening it confirms the number
      version: { type: Number, default: 0 }, // +1 on every rebuild (phone confirmed, email changed)
      pdfUrl: { type: String, default: "" },
      builtAt: { type: Date, default: null },
      buildError: { type: String, default: "" },
      sentAt: { type: Date, default: null }, // deal_sheet.sent: the email went out
      emailedTo: { type: String, default: "" },
      openCount: { type: Number, default: 0 }, // deal_sheet.opened: /s/<token> views
      firstOpenedAt: { type: Date, default: null },
      lastOpenedAt: { type: Date, default: null },
      bookClicks: { type: Number, default: 0 }, // vihara.ai/b/<ref> visits
    },
  },
  { timestamps: true }
);

propertyLeadSchema.index({ ref: 1 }, { unique: true, sparse: true });
propertyLeadSchema.index({ "dealSheet.token": 1 }, { unique: true, sparse: true });
// The 30-minute unverified-call sweep.
propertyLeadSchema.index({ form: 1, signupCallAt: 1, phoneVerifiedAt: 1, createdAt: 1 });

// One registration per phone PER property (the dedup gate).
propertyLeadSchema.index({ propertySlug: 1, phoneNormalized: 1 }, { unique: true });

// Scheduler sweep: "find leads whose daily callback is due" (per property).
propertyLeadSchema.index({ propertySlug: 1, callStatus: 1, nextCallAt: 1 });
propertyLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

module.exports = mongoose.model("propertyLeadModel", propertyLeadSchema);
