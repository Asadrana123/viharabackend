const mongoose = require("mongoose");

// Every suggested change, from the weekly list or from a creative approval
// (spec table `proposals`). Nothing is written to Meta or Zernio unless its
// proposal was approved by a named approver.

const PROPOSAL_KINDS = Object.freeze(["refresh", "vary", "try", "budget", "pause", "launch"]);

const PROPOSAL_STATUS = Object.freeze({
    PROPOSED: "proposed",
    GO: "go", // creative proposals: building
    BUILT: "built", // creative is in #creative-review
    APPROVED: "approved", // launch: ad created PAUSED, waiting for "activate"
    EXECUTED: "executed",
    REJECTED: "rejected",
    BLOCKED: "blocked", // a guardrail stopped it
    FAILED: "failed",
});

const adProposalSchema = new mongoose.Schema(
    {
        proposalId: { type: String, required: true, unique: true }, // "2026-W42-03"
        week: { type: String, required: true }, // ISO week "2026-W42"
        kind: { type: String, enum: PROPOSAL_KINDS, required: true },
        ltId: { type: String, default: null, index: true },
        payload: { type: mongoose.Schema.Types.Mixed, required: true },
        status: { type: String, enum: Object.values(PROPOSAL_STATUS), default: PROPOSAL_STATUS.PROPOSED, index: true },
        decidedBy: { type: String, default: null }, // Slack user id
        decidedAt: { type: Date, default: null },
        // Why a guardrail blocked it, or why it failed.
        note: { type: String, default: "" },
        slackChannel: { type: String, default: "" },
        slackTs: { type: String, default: "" }, // thread anchor
    },
    { timestamps: true }
);

module.exports = mongoose.model("adProposal", adProposalSchema);
module.exports.PROPOSAL_KINDS = PROPOSAL_KINDS;
module.exports.PROPOSAL_STATUS = PROPOSAL_STATUS;
