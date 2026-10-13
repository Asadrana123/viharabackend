const mongoose = require("mongoose");

// design-rules.md, one rule per document. Claude proposes rules in the review
// thread (after approval) and in the weekly list; a person reacts ✅ to make
// one active. Rules that conflict or stop helping are removed by a person.
// GET /api/v1/ads-loop/design-rules.md exports the active rules as Markdown
// so they can also be kept in git.

const RULE_STATUS = Object.freeze({ PROPOSED: "proposed", ACTIVE: "active", REMOVED: "removed" });

const designRuleSchema = new mongoose.Schema(
    {
        text: { type: String, required: true, trim: true },
        // "review LT-0002" or "results 2026-W44"
        source: { type: String, required: true },
        status: { type: String, enum: Object.values(RULE_STATUS), default: RULE_STATUS.PROPOSED, index: true },
        slackChannel: { type: String, default: "" },
        slackTs: { type: String, default: "", index: true }, // the message people react ✅ to
        acceptedBy: { type: String, default: null },
        acceptedAt: { type: Date, default: null },
        removedBy: { type: String, default: null },
        removedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("designRule", designRuleSchema);
module.exports.RULE_STATUS = RULE_STATUS;
