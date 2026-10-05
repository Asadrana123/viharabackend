// model/vtext/vtextSettingsModel.js
//
// Global Vtext settings — a single document (vtextSettingsService.js
// always queries/updates with an empty filter, upserting on first use), not
// one row per admin or per property. More global toggles can land here
// later without a new collection.
const mongoose = require("mongoose");

const vtextSettingsSchema = new mongoose.Schema(
  {
    // Phase 7c — once an AI reply is drafted (VTEXT_AI_DRAFT_REPLY_ENABLED
    // gates whether drafting happens at all), this decides whether it
    // auto-sends immediately (true) or waits in the Inbox for an admin to
    // approve/edit/reject (false, the default — no AI-generated text goes
    // out to a real contact without a human looking at it first).
    aiAutoReplyEnabled: { type: Boolean, default: false },

    // Daily follow-up texts after a property signup (vtextFollowUpService.js).
    // Off by default. Turning it off pauses running sequences and stops new
    // enrollments; it does not cancel them.
    followUpsEnabled: { type: Boolean, default: false },

    // Whether an outbound text needs recorded consent (vtextComplianceService.canSend).
    // ON by default. Turning it OFF lets texts reach contacts with no consent on
    // file; opt-outs (STOP), invalid numbers and landlines stay blocked either way.
    // A settings document from before this field existed has no value: always
    // read it through isConsentRequired(), where missing means "required".
    requireConsent: { type: Boolean, default: true },
    consentChangedAt: { type: Date },
    consentChangedBy: {
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String },
    },
  },
  { timestamps: true }
);

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextSettingsModel", vtextSettingsSchema, "sendifysettingsmodels");
