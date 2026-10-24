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
});

facebookFormLeadSchema.path("source").default("facebook-form");

module.exports = mongoose.model("facebookFormLead", facebookFormLeadSchema);
