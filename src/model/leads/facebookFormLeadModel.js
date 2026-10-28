const mongoose = require("mongoose");
const NewDealsLead = require("./newDealsLeadModel");

/**
 * Facebook / Instagram instant-form leads (Meta Lead Ads), delivered by
 * Zernio's `lead.received` webhook. Admin → Leads → "Facebook Forms".
 *
 * Same shape as the /new-deals buy-box lead (buyBox, consent, Maya call
 * state, welcome email, Brevo), so the same call loop, notes, "stop
 * calling" and email flow work on it — but it is its own collection: a
 * person who also signed up on /new-deals has a separate record here.
 *
 * Within this collection one person = one record (deduped by email, then
 * phone); a repeat form submission is added to `formSubmissions`.
 */
const answerSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // the form question key, e.g. "price_range"
    question: { type: String, default: "" }, // the question as shown on the form
    value: { type: String, default: "" }, // raw answer (option key for multiple choice)
    label: { type: String, default: "" }, // the option's label when known
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    leadgenId: { type: String, required: true }, // Meta's lead id
    zernioLeadId: { type: String, default: "" },
    formId: { type: String, default: "" },
    formName: { type: String, default: "" },
    adId: { type: String, default: "" },
    adsetId: { type: String, default: "" },
    campaignId: { type: String, default: "" },
    isOrganic: { type: Boolean, default: false },
    answers: { type: [answerSchema], default: [] },
    submittedAt: { type: Date, default: null },
  },
  { _id: false }
);

const facebookFormLeadSchema = NewDealsLead.schema.clone();

facebookFormLeadSchema.add({
  // The latest submission's form / ad, for the admin list.
  formId: { type: String, default: "" },
  formName: { type: String, default: "" },
  adId: { type: String, default: "" },
  campaignId: { type: String, default: "" },
  isOrganic: { type: Boolean, default: false },
  // The latest submission's answers (question + answer), shown in admin.
  answers: { type: [answerSchema], default: [] },
  // Every form submission from this person, oldest first.
  formSubmissions: { type: [submissionSchema], default: [] },
  // Every Meta lead id seen for this person (retry / replay guard).
  leadgenIds: { type: [String], default: [], index: true },
  // Where consent came from: the form's call/text disclaimer ("form-disclaimer"), or "" (none).
  consentSource: { type: String, default: "" },
  // Imported from Meta's history by scripts/importFacebookFormLeads.js: saved for
  // the record only — no welcome email, Brevo, Slack or Maya call was sent.
  importedFromHistory: { type: Boolean, default: false },

  // ── Toorak lead forms (config/toorakForms.js, handover 28 Oct 2026) ───────
  // Every instant-form lead is tagged source "meta_leadform"; Toorak forms also
  // carry their route (form key, kind, property) and the hot flag.
  leadSource: { type: String, default: "meta_leadform" },
  adsetId: { type: String, default: "" },
  toorak: {
    type: new mongoose.Schema(
      {
        key: { type: String, default: "" },       // "financing-v2", "ml-baltimore" … or "unknown"
        kind: { type: String, default: "" },      // financing | property
        known: { type: Boolean, default: true },  // false = a Toorak-named form not in the config yet
        propertySlug: { type: String, default: "" },
        listingUrl: { type: String, default: "" },
      },
      { _id: false }
    ),
    default: null,
  },
  // Hot = buying within 30 days, paying cash, or 20%+ down (services/leads/toorakLeads.js). Called first.
  hot: { type: Boolean, default: false },
  hotReasons: { type: [String], default: [] },
  // Set by the team in Admin → Toorak Leads: contacted | unreachable | qualified | converted | disqualified.
  // "" = follow the calls (new → contacted / unreachable).
  leadStatus: { type: String, default: "" },
  leadStatusHistory: {
    type: [new mongoose.Schema({ status: String, by: String, at: Date }, { _id: false })],
    default: [],
  },
  // The team found the number wrong (Admin → Toorak Leads). With a bounced email → auto "disqualified".
  phoneInvalid: { type: Boolean, default: false },
  // Toorak forms: the sms_consent checkbox (texts). Calls use `consent` with consentSource "form-checkbox".
  smsConsent: { type: Boolean, default: false },
  // Facebook's testing tool lead (dummy data, or no ad id and not organic). Saved, and only ever
  // emailed / called at the internal test contacts (TOORAK_TEST_EMAIL / TOORAK_TEST_PHONE).
  isTest: { type: Boolean, default: false },
  // How this lead reached us: "webhook" (Zernio lead.received) or "poll" (the 15-minute safety net).
  receivedVia: { type: String, default: "webhook" },
  // Re-engagement email for leads from before the automation (src/scripts/toorakReengage.js), once per person.
  reengageEmailSentAt: { type: Date, default: null },
  reengageEmailError: { type: String, default: "" },
});

facebookFormLeadSchema.index({ "toorak.key": 1, createdAt: -1 });

facebookFormLeadSchema.path("source").default("facebook-form");

module.exports = mongoose.model("facebookFormLead", facebookFormLeadSchema);
