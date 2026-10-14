const mongoose = require("mongoose");

// Every write to Meta / Zernio (spec table `change_log`). Also the source for
// the "one budget change per ad set every 3 days" guardrail.

const CHANGE_ACTIONS = Object.freeze(["schedule_post", "create_ad", "update_budget", "pause", "activate"]);

const adChangeLogSchema = new mongoose.Schema(
    {
        proposalId: { type: String, default: null, index: true },
        coreId: { type: String, default: null },
        action: { type: String, enum: CHANGE_ACTIONS, required: true },
        // Meta ad set the change touched (budget / status changes).
        adSetId: { type: String, default: null, index: true },
        request: { type: mongoose.Schema.Types.Mixed, required: true },
        response: { type: mongoose.Schema.Types.Mixed, default: null },
        ok: { type: Boolean, default: true },
        approvedBy: { type: String, required: true }, // Slack user id
        triggerKey: { type: String, default: "" }, // the Slack message / action that triggered it
        executedAt: { type: Date, required: true, default: Date.now },
    },
    { timestamps: false }
);

adChangeLogSchema.index({ action: 1, adSetId: 1, executedAt: -1 });

module.exports = mongoose.model("adChangeLog", adChangeLogSchema);
module.exports.CHANGE_ACTIONS = CHANGE_ACTIONS;
