// model/design/designRequestModel.js
//
// One admin request to the design agent ("make the Contact page simpler"),
// from first try through preview, changes, going live and undo.
//
// Status flow:
//   checking     → (Landing Pages tab) Claude reads the uploaded mockup and lists
//                  what can't be built
//   needs_answer → some of the mockup can't be built: skip it and build, or discard
//   working  → Claude is editing the page
//   building → changes saved on a GitHub branch, Vercel is building the preview
//   ready    → preview link is ready for the admin
//   live     → approved and merged into the live site
//   undone   → the live change was reverted
//   failed   → something went wrong (see error); admin can try again
//   discarded→ admin threw it away (branch deleted)
// "Change this…" on a ready request sends it back to working with feedback.
const mongoose = require("mongoose");

const STATUSES = ["checking", "needs_answer", "working", "building", "ready", "approving", "live", "undoing", "undone", "failed", "discarded"];
const KINDS = ["design", "landing"];

const blockedSchema = new mongoose.Schema(
  {
    item: { type: String, default: "" },
    reason: { type: String, default: "" },
    instead: { type: String, default: "" },
  },
  { _id: false }
);

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
    // "design": Design Studio (described in words). "landing": Landing Pages tab
    // (built from an uploaded HTML mockup, keeping the landing theme).
    kind: { type: String, enum: KINDS, default: "design", index: true },
    pageKey: { type: String, required: true, trim: true }, // DESIGN_PAGES key, or "new"
    pageLabel: { type: String, required: true, trim: true },
    pagePath: { type: String, required: true, trim: true }, // e.g. /contact-us or /p/spring-promo
    newPageSlug: { type: String, default: "", trim: true },
    // Files the agent may change, and the folder it may add new files to,
    // fixed when the request is made (see services/design/pageDiscovery.js).
    editable: { type: [String], default: [] },
    newFilesIn: { type: String, default: "" },
    status: { type: String, enum: STATUSES, default: "working", index: true },
    branch: { type: String, default: "" },
    // Which server runs this request (local and live backends share one DB).
    worker: { type: String, default: "" },
    rounds: { type: [roundSchema], default: [] },
    // Landing Pages tab: the uploaded mockup (cleaned; only loaded when building).
    mockup: {
      fileName: { type: String, default: "", trim: true },
      html: { type: String, default: "", select: false },
    },
    // What the mockup check found. Blocked items are skipped when the designer
    // chooses "skip these and build".
    review: {
      summary: { type: String, default: "" },
      sections: { type: [String], default: [] },
      blocked: { type: [blockedSchema], default: [] },
      ignored: { type: [String], default: [] },
      checkedAt: { type: Date },
      skippedByName: { type: String, default: "" },
    },
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
designRequestSchema.statics.KINDS = KINDS;

module.exports = mongoose.model("designRequestModel", designRequestSchema);
