// model/studio/studioProposalModel.js
const mongoose = require("mongoose");

/**
 * A weekly learning proposal shown in the Video Studio (D-043). The Creative OS drafts it from what
 * repeated; the editor it is for decides it here, and an admin decides one that touches what stays
 * the same for everyone. The decision is the person's, in their words, and goes back to the Creative
 * OS, where an accepted proposal is applied and recorded.
 */

const proposalSchema = new mongoose.Schema(
  {
    // The Creative OS's id, e.g. P-0003.
    proposalId: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    proposal: { type: String, required: true },
    landsIn: { type: String, required: true },
    limits: { type: String, required: true },
    // The editor's name; null when an admin decides it.
    forEditor: { type: String, default: null },
    status: { type: String, enum: ["proposed", "accepted", "declined"], default: "proposed" },
    decision: {
      byName: { type: String, default: null },
      words: { type: String, default: null },
      at: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
    },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioProposal", proposalSchema);
