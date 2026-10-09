// model/design/designRequestModel.js
//
// One admin request to the design agent ("make the Contact page simpler"),
// from first try through preview, changes, going live and undo.
//
// Status flow:
//   working  → Claude is editing the page
//   building → changes saved on a GitHub branch, Vercel is building the preview
//   ready    → preview link is ready for the admin
//   live     → approved and merged into the live site
//   undone   → the live change was reverted
//   failed   → something went wrong (see error); admin can try again
//   discarded→ admin threw it away (branch deleted)
// "Change this…" on a ready request sends it back to working with feedback.
const mongoose = require("mongoose");

const STATUSES = ["working", "building", "ready", "approving", "live", "undoing", "undone", "failed", "discarded"];

const roundSchema = new mongoose.Schema(
  {
    // What the admin asked for this round (first request or a "Change this…").
    instruction: { type: String, required: true, trim: true, maxlength: 4000 },
    byName: { type: String, default: "", trim: true },
    // Claude's plain-language summary of what it changed.
    summary: { type: String, default: "" },
    filesChanged: { type: [String], default: [] },
    commitSha: { type: String, default: "" },
    previewUrl: { type: String, default: "" },
    error: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { _id: false }
);

const designRequestSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, trim: true }, // DESIGN_PAGES key, or "new"
    pageLabel: { type: String, required: true, trim: true },
    pagePath: { type: String, required: true, trim: true }, // e.g. /contact-us or /p/spring-promo
    newPageSlug: { type: String, default: "", trim: true },
    status: { type: String, enum: STATUSES, default: "working", index: true },
    branch: { type: String, default: "" },
    rounds: { type: [roundSchema], default: [] },
    // Plain-language reason shown to the admin when status is "failed".
    error: { type: String, default: "" },

    createdByName: { type: String, default: "", trim: true },
    approvedByName: { type: String, default: "", trim: true },
    approvedAt: { type: Date },
    prNumber: { type: Number },
    mergeSha: { type: String, default: "" },
    undoneByName: { type: String, default: "", trim: true },
    undoneAt: { type: Date },
    undoSha: { type: String, default: "" },

    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
      cacheWriteTokens: { type: Number, default: 0 },
      costUsd: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

designRequestSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model("designRequestModel", designRequestSchema);
