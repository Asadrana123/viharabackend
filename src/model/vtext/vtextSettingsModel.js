// model/vtext/vtextSettingsModel.js
//
// Global Vtext settings — a single document (vtextSettingsService.js
// always queries/updates with an empty filter, upserting on first use), not
// one row per admin or per property. Starts with just quiet-hours on/off;
// more global toggles can land here later without a new collection.
const mongoose = require("mongoose");

const vtextSettingsSchema = new mongoose.Schema(
  {
    // Default hours of the day quiet-hours policy are enforced in. When false,
    // vtextQuietHoursService.checkQuietHours lets every message through
    // immediately — an admin override for testing or an urgent send, not a
    // replacement for the policy.
    quietHoursEnabled: { type: Boolean, default: true },

    // Phase 7c — once an AI reply is drafted (VTEXT_AI_DRAFT_REPLY_ENABLED
    // gates whether drafting happens at all), this decides whether it
    // auto-sends immediately (true) or waits in the Inbox for an admin to
    // approve/edit/reject (false, the default — no AI-generated text goes
    // out to a real contact without a human looking at it first).
    aiAutoReplyEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextSettingsModel", vtextSettingsSchema, "sendifysettingsmodels");
