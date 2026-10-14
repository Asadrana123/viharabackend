const mongoose = require("mongoose");

// A design rule suggestion. The source of truth for design rules is the
// Creative OS repo (its rules/ and learning/ folders, with a decision log), so
// a rule here never changes brand, wording or compliance rules on its own:
//
//   proposed  Claude suggested it in a review thread or the weekly list
//   endorsed  an approver reacted ✅: queued for the Creative OS
//             (GET /api/v1/ads-loop/design-rules/queue.md exports the queue)
//   recorded  a person recorded it as a decision in the Creative OS repo
//             (POST /api/v1/ads-loop/design-rules/:id/recorded); only these
//             are shown to the interim Claude builder
//   removed   dropped by a person

const RULE_STATUS = Object.freeze({
    PROPOSED: "proposed",
    ENDORSED: "endorsed",
    RECORDED: "recorded",
    REMOVED: "removed",
});

const designRuleSchema = new mongoose.Schema(
    {
        text: { type: String, required: true, trim: true },
        // "review BB449-S01" or "results 2026-W44"
        source: { type: String, required: true },
        status: { type: String, enum: Object.values(RULE_STATUS), default: RULE_STATUS.PROPOSED, index: true },
        slackChannel: { type: String, default: "" },
        slackTs: { type: String, default: "", index: true }, // the message people react ✅ to
        endorsedBy: { type: String, default: null }, // Slack user id
        endorsedAt: { type: Date, default: null },
        recordedBy: { type: String, default: null }, // admin user id
        recordedAt: { type: Date, default: null },
        // Where it was recorded in the Creative OS repo (e.g. "rules/layout.md#price-size").
        recordedAs: { type: String, default: "" },
        removedBy: { type: String, default: null },
        removedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("designRule", designRuleSchema);
module.exports.RULE_STATUS = RULE_STATUS;
