// model/qa/qaRunModel.js
//
// One document per QA agent run. An admin types a plain-language request
// ("Test the property auction registration form"), the agent explores the
// code, posts a plan, the admin approves or gives feedback, then the agent
// runs the approved tests and reports back — all recorded on this document.
const mongoose = require("mongoose");

const RUN_STATUSES = [
  "queued",            // created by admin, waiting for a worker
  "exploring",         // agent is reading the code / site to build a plan
  "needs_clarification", // request wasn't a clear test request; agent replied, waiting for admin
  "awaiting_approval", // plan posted, waiting for admin
  "revising",          // admin gave feedback, waiting for a worker to re-plan
  "approved",          // admin approved, waiting for a worker to run tests
  "running",           // agent is writing + running the approved tests
  "waiting_for_input", // agent asked the admin something and is paused on it
  "done",
  "failed",
  "cancelled",
];

// Statuses a worker can pick up, mapped to the status it moves the run into.
const CLAIMABLE = {
  queued: "exploring",
  revising: "exploring",
  approved: "running",
};

const PLAN_ITEM_KINDS = ["api", "ui", "realtime", "real_world"];
const QUESTION_KINDS = ["yes_no", "text", "allow_skip", "number"];
const RESULT_STATUSES = ["pass", "fail", "skipped", "not_verified"];
const MESSAGE_TYPES = ["request", "plan", "feedback", "question", "answer", "report", "status", "note", "clarification"];

const planItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true }, // stable id, e.g. "T1", referenced by admin feedback + results
    title: { type: String, required: true, trim: true }, // plain language: what will be checked
    why: { type: String, default: "", trim: true },      // why it matters / why it was picked
    kind: { type: String, enum: PLAN_ITEM_KINDS, default: "api" },
    included: { type: Boolean, default: true },          // false = left out to stay within budget
    skipReason: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true }, // e.g. "Q1"
    text: { type: String, required: true, trim: true },
    kind: { type: String, enum: QUESTION_KINDS, default: "text" },
    status: { type: String, enum: ["pending", "answered", "expired"], default: "pending" },
    answer: { type: String, default: "", trim: true },
    answeredBy: { type: String, default: "", trim: true },
    answeredAt: { type: Date },
    expiresAt: { type: Date },
    // When true, the answer is saved to qaKnowledge so the agent doesn't ask again.
    remember: { type: Boolean, default: false },
    rememberKey: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ["agent", "admin", "system"], required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: "note" },
    text: { type: String, default: "", trim: true },
    authorName: { type: String, default: "", trim: true }, // snapshot, admin messages only
    questionKey: { type: String, default: "" },            // set on question/answer messages
    planVersion: { type: Number },                          // set on plan messages
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const resultSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true }, // matches a plan item key
    title: { type: String, default: "", trim: true },
    status: { type: String, enum: RESULT_STATUSES, required: true },
    detail: { type: String, default: "", trim: true },   // plain-language explanation
    location: { type: String, default: "", trim: true }, // file:line when a bug is pinned down
  },
  { _id: false }
);

const qaRunSchema = new mongoose.Schema(
  {
    request: { type: String, required: true, trim: true, maxlength: 2000 },
    requestedBy: {
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String, default: "", trim: true },
    },

    budget: {
      maxTests: { type: Number, default: 15, min: 1, max: 50 },
      maxUiTests: { type: Number, default: 3, min: 0, max: 20 },
      maxMinutes: { type: Number, default: 15, min: 1, max: 120 },
      // Hard cap: a whole run (plan + tests + report) never costs more than $2.
      maxCostUsd: { type: Number, default: 2, min: 0.1, max: 2 },
    },

    status: { type: String, enum: RUN_STATUSES, default: "queued", index: true },

    plan: {
      version: { type: Number, default: 0 },
      summary: { type: String, default: "", trim: true }, // what the feature is, in plain words
      // Side effects and risks the admin should know before approving
      // ("each sign-up posts to the team Slack"), kept out of the summary.
      headsUp: { type: [String], default: [] },
      items: { type: [planItemSchema], default: [] },
      approvedVersion: { type: Number },
      approvedBy: { type: String, default: "", trim: true },
      approvedAt: { type: Date },
    },

    messages: { type: [messageSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    results: { type: [resultSchema], default: [] },
    reportSummary: { type: String, default: "", trim: true },

    costUsd: { type: Number, default: 0 },
    error: { type: String, default: "", trim: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },

    // Worker lock: one worker owns a run at a time. A lock older than the
    // stale window (see claim logic) is treated as abandoned.
    lockedBy: { type: String, default: "" },
    lockedAt: { type: Date },
  },
  { timestamps: true }
);

// Admin list: newest first, optionally filtered by status.
qaRunSchema.index({ createdAt: -1 });
// Worker claim: oldest claimable run first.
qaRunSchema.index({ status: 1, updatedAt: 1 });

module.exports = mongoose.model("qaRunModel", qaRunSchema);
module.exports.RUN_STATUSES = RUN_STATUSES;
module.exports.CLAIMABLE = CLAIMABLE;
module.exports.PLAN_ITEM_KINDS = PLAN_ITEM_KINDS;
module.exports.QUESTION_KINDS = QUESTION_KINDS;
module.exports.RESULT_STATUSES = RESULT_STATUSES;
