const mongoose = require("mongoose");
const { formAnswerSchemaDef } = require("../../services/leads/formAnswers");

/**
 * Leads from forms on landing pages made in Admin → Landing Pages
 * (/lp/<slug>). The designer decides the questions, so apart from the contact
 * fields every answer is stored as asked: answers = [{ question, answer }].
 *
 * Same call flow as /new-deals: with consent, Maya calls on signup and retries
 * daily (11:00 / 2:30 / 6:00 local) until someone picks up — see
 * landingFormCallScheduler.
 *
 * Dedup is by page + email: a repeat sign-up on the same page UPDATES the
 * contact and answers but never the ORIGINAL first touch.
 */
const landingFormLeadSchema = new mongoose.Schema(
  {
    page: { type: String, required: true, trim: true }, // the /lp/<slug> slug
    pageUrl: { type: String, default: "", trim: true },

    fullName: { type: String, default: "", trim: true },
    firstName: { type: String, default: "", trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true }, // raw, as entered
    phoneNormalized: { type: String, default: "", trim: true }, // E.164, for dialing
    timezone: { type: String, default: "" },

    answers: formAnswerSchemaDef,

    consent: { type: Boolean, default: false },
    consentText: { type: String, default: "" },
    consentTimestamp: { type: Date, default: null },
    smsConsent: { type: Boolean, default: false },
    smsConsentText: { type: String, default: "" },
    smsConsentAt: { type: Date, default: null },

    eventId: { type: String, default: "" },
    firstTouch: { type: mongoose.Schema.Types.Mixed, default: null },
    lastTouch: { type: mongoose.Schema.Types.Mixed, default: null },
    submissions: { type: Number, default: 1 },

    // Call flow (landingFormCallScheduler / followUpCadence)
    callStatus: { type: String, enum: ["pending", "no-answer", "connected", "not-reached"], default: "pending" },
    callAttempts: { type: Number, default: 0 },
    lastCallAt: { type: Date, default: null },
    nextCallAt: { type: Date, default: null },
    followUpStartedAt: { type: Date, default: null },
    callingStopped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

landingFormLeadSchema.index({ page: 1, email: 1 }, { unique: true });
landingFormLeadSchema.index({ phoneNormalized: 1 });
landingFormLeadSchema.index({ createdAt: -1 });
landingFormLeadSchema.index({ callStatus: 1, nextCallAt: 1 });

module.exports = mongoose.model("landingFormLead", landingFormLeadSchema);
