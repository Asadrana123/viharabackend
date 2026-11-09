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

    // "SMS only": while ON, new texts to US numbers skip iMessage and go out through the Twilio SMS line
    // (vtextRouter.selectLine). For when the iMessage line can't deliver (Apple restricting the account, a dead
    // Mac) — sending more from a restricted Apple ID can keep it restricted. OFF by default. Images, non-US
    // numbers and texts pinned to a channel still follow normal routing.
    smsOnly: { type: Boolean, default: false },
    smsOnlyChangedAt: { type: Date },
    smsOnlyChangedBy: {
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String },
    },

    // Bookkeeping for Slack alerts (vtextAlertService.js): when each alert key last
    // fired, and watermarks such as "failed sends reported up to here". Keys are
    // free-form, so it is Mixed. Documents from before this field existed work as-is.
    alertState: { type: mongoose.Schema.Types.Mixed, default: {} },
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
