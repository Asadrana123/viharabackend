// controller/qa/qaAdminController.js
//
// Admin side of the QA agent: start a run from a plain-language request,
// review the agent's plan, approve it or send feedback, answer the agent's
// questions, cancel, and manage the facts the agent remembers.
//
// Every status change is a conditional findOneAndUpdate on the expected
// current status, so an admin action and a worker update can never both win.
const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const QaRun = require("../../model/qa/qaRunModel");
const QaKnowledge = require("../../model/qa/qaKnowledgeModel");
const { notifyQaRun } = require("../../socket/qaSocket");

const TERMINAL = ["done", "failed", "cancelled"];
const BUDGET_FIELDS = ["maxTests", "maxUiTests", "maxMinutes", "maxCostUsd"];

const adminName = (user) =>
  [user?.name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";

const BUDGET_LABELS = {
  maxTests: "Max tests",
  maxUiTests: "Max UI tests",
  maxMinutes: "Max minutes",
  maxCostUsd: "Max cost ($)",
};

// Returns { budget } or { error }. Ranges come from the schema so they live in one place.
const pickBudget = (input) => {
  const budget = {};
  if (!input || typeof input !== "object") return { budget };
  for (const field of BUDGET_FIELDS) {
    if (input[field] === undefined || input[field] === "") continue;
    const n = Number(input[field]);
    const { min, max } = QaRun.schema.path(`budget.${field}`).options;
    if (!Number.isFinite(n) || n < min || n > max) {
      return { error: `${BUDGET_LABELS[field]} must be between ${min} and ${max}` };
    }
    budget[field] = n;
  }
  return { budget };
};

const requireRunId = (req, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    next(new ErrorHandler("Invalid run id", 400));
    return false;
  }
  return true;
};

// Distinguishes "no such run" (404) from "run exists but is in the wrong
// status for this action" (409) after a conditional update matched nothing.
const explainMiss = async (id, action, next) => {
  const run = await QaRun.findById(id).select("status").lean();
  if (!run) return next(new ErrorHandler("QA run not found", 404));
  return next(new ErrorHandler(`Cannot ${action} while the run is "${run.status}"`, 409));
};

/**
 * POST /api/v1/qa/runs   { request, budget? }
 * Starts a run from what the admin typed, e.g. "Test the property auction
 * registration form". A worker picks it up from "queued".
 */
const createRun = catchAsyncError(async (req, res, next) => {
  const request = typeof req.body.request === "string" ? req.body.request.trim() : "";
  if (!request) return next(new ErrorHandler("Tell the QA agent what to test", 400));
  if (request.length > 2000) return next(new ErrorHandler("Request is too long (max 2000 characters)", 400));
  const { budget, error } = pickBudget(req.body.budget);
  if (error) return next(new ErrorHandler(error, 400));

  const run = await QaRun.create({
    request,
    requestedBy: { id: req.user._id, name: adminName(req.user) },
    budget,
    messages: [{ from: "admin", type: "request", text: request, authorName: adminName(req.user) }],
  });

  notifyQaRun(run._id, "created", run.status);
  res.status(201).json({ success: true, run });
});

/**
 * GET /api/v1/qa/runs?status=&page=&limit=
 * List view only — the thread, questions and results come from getRun.
 */
const listRuns = catchAsyncError(async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

  const filter = {};
  if (req.query.status) {
    if (!QaRun.RUN_STATUSES.includes(req.query.status)) {
      return next(new ErrorHandler("Invalid status filter", 400));
    }
    filter.status = req.query.status;
  }

  const [runs, total] = await Promise.all([
    QaRun.find(filter)
      .select("request requestedBy status budget plan.version plan.summary costUsd reportSummary createdAt updatedAt finishedAt questions.status results.status")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    QaRun.countDocuments(filter),
  ]);

  // Small counts for the list badges, then drop the arrays they came from.
  const rows = runs.map(({ questions = [], results = [], ...run }) => ({
    ...run,
    pendingQuestions: questions.filter((q) => q.status === "pending").length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  }));

  res.status(200).json({ success: true, runs: rows, total, page, limit });
});

/** GET /api/v1/qa/runs/:id — full run: plan, thread, questions, results. */
const getRun = catchAsyncError(async (req, res, next) => {
  if (!requireRunId(req, next)) return;
  const run = await QaRun.findById(req.params.id).select("-lockedBy -lockedAt").lean();
  if (!run) return next(new ErrorHandler("QA run not found", 404));
  res.status(200).json({ success: true, run });
});

/**
 * POST /api/v1/qa/runs/:id/approve   { planVersion }
 * planVersion must match the plan on screen, so an admin can never approve a
 * plan the agent has since replaced.
 */
const approvePlan = catchAsyncError(async (req, res, next) => {
  if (!requireRunId(req, next)) return;
  const planVersion = Number(req.body.planVersion);
  if (!Number.isInteger(planVersion) || planVersion < 1) {
    return next(new ErrorHandler("planVersion is required", 400));
  }

  const name = adminName(req.user);
  const run = await QaRun.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "awaiting_approval",
      "plan.version": planVersion,
      "plan.items": { $elemMatch: { included: true } },
    },
    {
      $set: {
        status: "approved",
        "plan.approvedVersion": planVersion,
        "plan.approvedBy": name,
        "plan.approvedAt": new Date(),
      },
      $push: { messages: { from: "admin", type: "status", text: `Approved plan v${planVersion}`, authorName: name } },
    },
    { new: true }
  );

  if (!run) {
    const current = await QaRun.findById(req.params.id).select("status plan.version plan.items.included").lean();
    if (!current) return next(new ErrorHandler("QA run not found", 404));
    if (current.status !== "awaiting_approval") {
      return next(new ErrorHandler(`Cannot approve while the run is "${current.status}"`, 409));
    }
    if (current.plan.version !== planVersion) {
      return next(new ErrorHandler("The plan has changed since you opened it — please review the latest version", 409));
    }
    return next(new ErrorHandler("The plan has no included tests to run", 400));
  }

  notifyQaRun(run._id, "approved", run.status);
  res.status(200).json({ success: true, run });
});

/**
 * POST /api/v1/qa/runs/:id/feedback   { text }
 * Plain-language changes to the plan ("drop T4, also test +1 phones"), or the
 * admin's reply when the agent asked what the request meant. Either way the
 * run goes back to a worker to (re-)plan.
 */
const sendFeedback = catchAsyncError(async (req, res, next) => {
  if (!requireRunId(req, next)) return;
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) return next(new ErrorHandler("Feedback text is required", 400));
  if (text.length > 4000) return next(new ErrorHandler("Feedback is too long (max 4000 characters)", 400));

  const run = await QaRun.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ["awaiting_approval", "needs_clarification"] } },
    {
      $set: { status: "revising" },
      $push: { messages: { from: "admin", type: "feedback", text, authorName: adminName(req.user) } },
    },
    { new: true }
  );
  if (!run) return explainMiss(req.params.id, "reply", next);

  notifyQaRun(run._id, "feedback", run.status);
  res.status(200).json({ success: true, run });
});

/**
 * POST /api/v1/qa/runs/:id/questions/:key/answer   { answer, remember? }
 * Answers one pending question. With remember=true (or a question the agent
 * flagged to remember) the answer is stored in qaKnowledge for future runs.
 */
const answerQuestion = catchAsyncError(async (req, res, next) => {
  if (!requireRunId(req, next)) return;
  const key = req.params.key;
  const answer = req.body.answer === undefined || req.body.answer === null ? "" : String(req.body.answer).trim();
  if (!answer) return next(new ErrorHandler("Answer is required", 400));
  if (answer.length > 2000) return next(new ErrorHandler("Answer is too long (max 2000 characters)", 400));

  const existing = await QaRun.findById(req.params.id).select("status questions").lean();
  if (!existing) return next(new ErrorHandler("QA run not found", 404));
  const question = existing.questions.find((q) => q.key === key);
  if (!question) return next(new ErrorHandler("Question not found", 404));
  if (question.status !== "pending") {
    return next(new ErrorHandler(`This question is already ${question.status}`, 409));
  }

  if (question.kind === "yes_no" && !["yes", "no"].includes(answer.toLowerCase())) {
    return next(new ErrorHandler('Answer must be "yes" or "no"', 400));
  }
  if (question.kind === "allow_skip" && !["allow", "skip"].includes(answer.toLowerCase())) {
    return next(new ErrorHandler('Answer must be "allow" or "skip"', 400));
  }
  if (question.kind === "number" && !Number.isFinite(Number(answer))) {
    return next(new ErrorHandler("Answer must be a number", 400));
  }
  const normalized = ["yes_no", "allow_skip"].includes(question.kind) ? answer.toLowerCase() : answer;

  const name = adminName(req.user);
  const run = await QaRun.findOneAndUpdate(
    { _id: req.params.id, status: { $nin: TERMINAL }, questions: { $elemMatch: { key, status: "pending" } } },
    {
      $set: {
        "questions.$.status": "answered",
        "questions.$.answer": normalized,
        "questions.$.answeredBy": name,
        "questions.$.answeredAt": new Date(),
      },
      $push: { messages: { from: "admin", type: "answer", text: normalized, authorName: name, questionKey: key } },
    },
    { new: true }
  );
  if (!run) return explainMiss(req.params.id, "answer this question", next);

  // Last pending question answered → let the paused agent continue.
  if (run.status === "waiting_for_input" && !run.questions.some((q) => q.status === "pending")) {
    await QaRun.updateOne({ _id: run._id, status: "waiting_for_input" }, { $set: { status: "running" } });
    run.status = "running";
  }

  const remember = req.body.remember === true || question.remember;
  if (remember) {
    const rememberKey = (question.rememberKey || key).toLowerCase();
    await QaKnowledge.findOneAndUpdate(
      { key: rememberKey },
      { $set: { value: normalized, description: question.text, source: "answer", sourceRunId: run._id, updatedByName: name } },
      { upsert: true, runValidators: true }
    );
  }

  notifyQaRun(run._id, "answered", run.status);
  res.status(200).json({ success: true, run });
});

/** POST /api/v1/qa/runs/:id/cancel — stops a run at any non-finished stage. */
const cancelRun = catchAsyncError(async (req, res, next) => {
  if (!requireRunId(req, next)) return;
  const run = await QaRun.findOneAndUpdate(
    { _id: req.params.id, status: { $nin: TERMINAL } },
    {
      $set: { status: "cancelled", finishedAt: new Date(), lockedBy: "", lockedAt: null },
      $push: { messages: { from: "admin", type: "status", text: "Cancelled the run", authorName: adminName(req.user) } },
    },
    { new: true }
  );
  if (!run) return explainMiss(req.params.id, "cancel", next);
  notifyQaRun(run._id, "cancelled", run.status);
  res.status(200).json({ success: true, run });
});

/** GET /api/v1/qa/knowledge — everything the agent remembers. */
const listKnowledge = catchAsyncError(async (req, res) => {
  const facts = await QaKnowledge.find().sort({ key: 1 }).lean();
  res.status(200).json({ success: true, facts });
});

/** PUT /api/v1/qa/knowledge/:key   { value, description? } — add or edit a fact. */
const upsertKnowledge = catchAsyncError(async (req, res, next) => {
  const key = String(req.params.key || "").trim().toLowerCase();
  const value = typeof req.body.value === "string" ? req.body.value.trim() : "";
  if (!/^[a-z0-9_.-]{1,80}$/.test(key)) {
    return next(new ErrorHandler("Key must be 1-80 characters: letters, numbers, _ . -", 400));
  }
  if (!value) return next(new ErrorHandler("Value is required", 400));

  const update = { value, source: "admin", updatedByName: adminName(req.user) };
  if (typeof req.body.description === "string") update.description = req.body.description.trim();

  const fact = await QaKnowledge.findOneAndUpdate({ key }, { $set: update }, { new: true, upsert: true, runValidators: true });
  res.status(200).json({ success: true, fact });
});

/** DELETE /api/v1/qa/knowledge/:key */
const deleteKnowledge = catchAsyncError(async (req, res, next) => {
  const key = String(req.params.key || "").trim().toLowerCase();
  const deleted = await QaKnowledge.findOneAndDelete({ key });
  if (!deleted) return next(new ErrorHandler("Fact not found", 404));
  res.status(200).json({ success: true });
});

module.exports = {
  createRun,
  listRuns,
  getRun,
  approvePlan,
  sendFeedback,
  answerQuestion,
  cancelRun,
  listKnowledge,
  upsertKnowledge,
  deleteKnowledge,
};
