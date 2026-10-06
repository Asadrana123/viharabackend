// controller/qa/qaAgentController.js
//
// Worker side of the QA agent. The worker process polls /claim, then works on
// the run it holds:
//   plan phase  (exploring)  → posts a plan → awaiting_approval (lock released,
//                               it's the admin's turn)
//   test phase  (running)    → posts progress, questions and results → finish
//
// A worker owns a run through lockedBy/lockedAt and keeps the lock fresh with
// /heartbeat. Every call except /claim and /knowledge must come from the worker
// holding the lock. Heartbeat also tells the worker when an admin cancelled.
const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const QaRun = require("../../model/qa/qaRunModel");
const QaKnowledge = require("../../model/qa/qaKnowledgeModel");
const { notifyQaRun } = require("../../socket/qaSocket");

const TERMINAL = ["done", "failed", "cancelled"];
// No heartbeat for this long → the worker is presumed dead.
const LOCK_STALE_MS = 10 * 60 * 1000;
const QUESTION_TIMEOUT_DEFAULT_MIN = 30;
const QUESTION_TIMEOUT_MAX_MIN = 24 * 60;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Worker died mid-run. A stale "exploring" run is safe to plan again, so it's
 * returned to the queue. A stale "running"/"waiting_for_input" run is failed
 * instead of retried — re-running half-finished tests could repeat real side
 * effects (calls, emails) the admin only approved once.
 */
const recoverStaleRuns = async () => {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const stale = await QaRun.find({
    status: { $in: ["exploring", "running", "waiting_for_input"] },
    lockedAt: { $lt: staleBefore },
  }).select("status").lean();

  for (const run of stale) {
    const replan = run.status === "exploring";
    const updated = await QaRun.findOneAndUpdate(
      // Re-check staleness so a heartbeat that landed meanwhile wins.
      { _id: run._id, status: run.status, lockedAt: { $lt: staleBefore } },
      replan
        ? {
            $set: { status: "queued", lockedBy: "", lockedAt: null },
            $push: { messages: { from: "system", type: "status", text: "The QA worker stopped responding while planning — re-queued." } },
          }
        : {
            $set: { status: "failed", error: "QA worker stopped responding during the test run", finishedAt: new Date(), lockedBy: "", lockedAt: null },
            $push: { messages: { from: "system", type: "status", text: "The QA worker stopped responding during the test run. Start a new run to try again." } },
          },
      { new: true }
    ).select("status").lean();
    if (updated) notifyQaRun(updated._id, replan ? "requeued" : "failed", updated.status);
  }
};

const PHASE_OF_STATUS = { exploring: "plan", running: "test" };

/**
 * POST /api/v1/qa-agent/claim   { phases?: ["plan", "test"] }
 * Takes the oldest run waiting for a worker. Returns { run: null } when idle.
 * phase: "plan" (build or revise a plan) or "test" (run the approved plan).
 * `phases` limits what this worker takes (default: both).
 */
const claimRun = catchAsyncError(async (req, res, next) => {
  const phases = req.body?.phases === undefined ? ["plan", "test"] : req.body.phases;
  if (!Array.isArray(phases) || phases.length === 0 || phases.some((p) => !["plan", "test"].includes(p))) {
    return next(new ErrorHandler('phases must be a non-empty array of "plan" and/or "test"', 400));
  }

  await recoverStaleRuns();

  const claimable = Object.keys(QaRun.CLAIMABLE).filter((s) => phases.includes(PHASE_OF_STATUS[QaRun.CLAIMABLE[s]]));
  // A few attempts in case another worker claims the same candidate first.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = await QaRun.findOne({ status: { $in: claimable } })
      .sort({ updatedAt: 1 })
      .select("status")
      .lean();
    if (!candidate) break;

    const nextStatus = QaRun.CLAIMABLE[candidate.status];
    const run = await QaRun.findOneAndUpdate(
      { _id: candidate._id, status: candidate.status },
      {
        $set: { status: nextStatus, lockedBy: req.qaWorkerId, lockedAt: new Date() },
        $min: { startedAt: new Date() },
      },
      { new: true }
    ).lean();
    if (!run) continue;

    notifyQaRun(run._id, "claimed", run.status);
    return res.status(200).json({ success: true, phase: PHASE_OF_STATUS[nextStatus], run });
  }

  res.status(200).json({ success: true, run: null });
});

// Loads the run and checks this worker holds it and it's in an allowed status.
const loadOwnedRun = async (req, next, allowedStatuses) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    next(new ErrorHandler("Invalid run id", 400));
    return null;
  }
  const run = await QaRun.findById(req.params.id).lean();
  if (!run) {
    next(new ErrorHandler("QA run not found", 404));
    return null;
  }
  if (run.lockedBy !== req.qaWorkerId) {
    next(new ErrorHandler("This worker does not hold the lock on this run", 409));
    return null;
  }
  if (!allowedStatuses.includes(run.status)) {
    next(new ErrorHandler(`Not allowed while the run is "${run.status}"`, 409));
    return null;
  }
  return run;
};

/**
 * POST /api/v1/qa-agent/runs/:id/heartbeat   { costUsd? }
 * Keeps the lock fresh and reports cost so far. stop=true tells the worker to
 * abandon the run (admin cancelled, or it was failed/finished elsewhere).
 */
const heartbeat = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next(new ErrorHandler("Invalid run id", 400));

  const set = { lockedAt: new Date() };
  const update = { $set: set };
  const cost = Number(req.body.costUsd);
  if (Number.isFinite(cost) && cost >= 0) update.$max = { costUsd: cost };

  const run = await QaRun.findOneAndUpdate(
    { _id: req.params.id, lockedBy: req.qaWorkerId, status: { $nin: TERMINAL } },
    update,
    { new: true }
  ).select("status questions").lean();

  if (!run) {
    const current = await QaRun.findById(req.params.id).select("status").lean();
    if (!current) return next(new ErrorHandler("QA run not found", 404));
    return res.status(200).json({ success: true, stop: true, status: current.status });
  }
  res.status(200).json({ success: true, stop: false, status: run.status, questions: run.questions });
});

/**
 * POST /api/v1/qa-agent/runs/:id/plan   { summary, headsUp?: [text], items: [{ key, title, why, kind, included, skipReason }], costUsd? }
 * Posts a new plan version and hands the run to the admin for approval.
 * Included tests must fit the run's budget.
 */
const submitPlan = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["exploring"]);
  if (!run) return;

  const summary = str(req.body.summary, 4000);
  if (!summary) return next(new ErrorHandler("Plan summary is required", 400));
  const rawHeadsUp = req.body.headsUp === undefined ? [] : req.body.headsUp;
  if (!Array.isArray(rawHeadsUp) || rawHeadsUp.length > 10 || rawHeadsUp.some((h) => typeof h !== "string")) {
    return next(new ErrorHandler("headsUp must be a list of up to 10 short texts", 400));
  }
  const headsUp = rawHeadsUp.map((h) => str(h, 500)).filter(Boolean);
  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
    return next(new ErrorHandler("Plan needs at least one item", 400));
  }
  if (req.body.items.length > 100) return next(new ErrorHandler("Plan has too many items (max 100)", 400));

  const seen = new Set();
  const items = [];
  for (const raw of req.body.items) {
    const item = {
      key: str(raw?.key, 20),
      title: str(raw?.title, 500),
      why: str(raw?.why, 1000),
      kind: QaRun.PLAN_ITEM_KINDS.includes(raw?.kind) ? raw.kind : null,
      included: raw?.included !== false,
      skipReason: str(raw?.skipReason, 500),
    };
    if (!item.key || !item.title) return next(new ErrorHandler("Every plan item needs a key and a title", 400));
    if (!item.kind) return next(new ErrorHandler(`Item ${item.key}: kind must be one of ${QaRun.PLAN_ITEM_KINDS.join(", ")}`, 400));
    if (seen.has(item.key)) return next(new ErrorHandler(`Duplicate plan item key ${item.key}`, 400));
    if (!item.included && !item.skipReason) return next(new ErrorHandler(`Item ${item.key} is skipped — give a skipReason`, 400));
    seen.add(item.key);
    items.push(item);
  }

  const included = items.filter((i) => i.included);
  if (included.length === 0) return next(new ErrorHandler("Plan needs at least one included test", 400));
  if (included.length > run.budget.maxTests) {
    return next(new ErrorHandler(`Plan includes ${included.length} tests, budget allows ${run.budget.maxTests}`, 400));
  }
  const uiCount = included.filter((i) => i.kind === "ui").length;
  if (uiCount > run.budget.maxUiTests) {
    return next(new ErrorHandler(`Plan includes ${uiCount} UI tests, budget allows ${run.budget.maxUiTests}`, 400));
  }

  const version = (run.plan?.version || 0) + 1;
  const cost = Number(req.body.costUsd);
  const updated = await QaRun.findOneAndUpdate(
    { _id: run._id, status: "exploring", lockedBy: req.qaWorkerId },
    {
      ...(Number.isFinite(cost) && cost >= 0 ? { $max: { costUsd: cost } } : {}),
      $set: {
        status: "awaiting_approval",
        "plan.version": version,
        "plan.summary": summary,
        "plan.headsUp": headsUp,
        "plan.items": items,
        lockedBy: "",
        lockedAt: null,
      },
      $push: { messages: { from: "agent", type: "plan", text: summary, planVersion: version } },
    },
    { new: true }
  ).lean();
  if (!updated) return next(new ErrorHandler("The run changed while the plan was being saved", 409));

  notifyQaRun(updated._id, "plan", updated.status);
  res.status(200).json({ success: true, run: updated });
});

/**
 * POST /api/v1/qa-agent/runs/:id/clarify   { text, costUsd? }
 * The request wasn't a clear test request (chit-chat, a change request,
 * too vague). Posts the agent's reply and hands the run back to the admin,
 * whose answer (via /qa/runs/:id/feedback) sends it back for planning.
 */
const clarifyRequest = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["exploring"]);
  if (!run) return;
  const text = str(req.body.text, 2000);
  if (!text) return next(new ErrorHandler("Reply text is required", 400));
  if (run.plan?.version > 0) return next(new ErrorHandler("This run already has a plan — use plan feedback instead", 409));

  const cost = Number(req.body.costUsd);
  const updated = await QaRun.findOneAndUpdate(
    { _id: run._id, status: "exploring", lockedBy: req.qaWorkerId },
    {
      ...(Number.isFinite(cost) && cost >= 0 ? { $max: { costUsd: cost } } : {}),
      $set: { status: "needs_clarification", lockedBy: "", lockedAt: null },
      $push: { messages: { from: "agent", type: "clarification", text } },
    },
    { new: true }
  ).lean();
  if (!updated) return next(new ErrorHandler("The run changed while replying", 409));

  notifyQaRun(updated._id, "clarification", updated.status);
  res.status(200).json({ success: true, run: updated });
});

/** POST /api/v1/qa-agent/runs/:id/messages   { text } — a progress note in the admin thread. */
const postMessage = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["exploring", "running", "waiting_for_input"]);
  if (!run) return;
  const text = str(req.body.text, 4000);
  if (!text) return next(new ErrorHandler("Message text is required", 400));

  await QaRun.updateOne({ _id: run._id }, { $push: { messages: { from: "agent", type: "note", text } } });
  notifyQaRun(run._id, "message", run.status);
  res.status(200).json({ success: true });
});

/**
 * POST /api/v1/qa-agent/runs/:id/questions
 *   { text, kind, remember?, rememberKey?, timeoutMinutes? }
 * Asks the admin something. The run shows "waiting for admin" until every
 * pending question is answered or expires; the worker may keep running other
 * tests meanwhile and polls GET .../questions/:key for the answer.
 */
const askQuestion = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["running", "waiting_for_input"]);
  if (!run) return;

  const text = str(req.body.text, 2000);
  if (!text) return next(new ErrorHandler("Question text is required", 400));
  const kind = req.body.kind || "text";
  if (!QaRun.QUESTION_KINDS.includes(kind)) {
    return next(new ErrorHandler(`kind must be one of ${QaRun.QUESTION_KINDS.join(", ")}`, 400));
  }
  const rememberKey = str(req.body.rememberKey, 80).toLowerCase();
  if (rememberKey && !/^[a-z0-9_.-]+$/.test(rememberKey)) {
    return next(new ErrorHandler("rememberKey may only contain letters, numbers, _ . -", 400));
  }
  const minutes = Math.min(QUESTION_TIMEOUT_MAX_MIN, Math.max(1, Number(req.body.timeoutMinutes) || QUESTION_TIMEOUT_DEFAULT_MIN));

  const key = `Q${run.questions.length + 1}`;
  const updated = await QaRun.findOneAndUpdate(
    // Guard on question count so two concurrent asks can't both take the same key.
    { _id: run._id, lockedBy: req.qaWorkerId, status: { $in: ["running", "waiting_for_input"] }, questions: { $size: run.questions.length } },
    {
      $set: { status: "waiting_for_input" },
      $push: {
        questions: {
          key,
          text,
          kind,
          remember: req.body.remember === true || Boolean(rememberKey),
          rememberKey,
          expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        },
        messages: { from: "agent", type: "question", text, questionKey: key },
      },
    },
    { new: true }
  ).lean();
  if (!updated) return next(new ErrorHandler("The run changed while asking — try again", 409));

  notifyQaRun(updated._id, "question", updated.status);
  res.status(201).json({ success: true, question: updated.questions.at(-1) });
});

/**
 * GET /api/v1/qa-agent/runs/:id/questions/:key
 * Polls one question. A pending question past its expiry is marked "expired"
 * here — the worker must then report that test as "not_verified", never "pass".
 */
const getQuestion = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["running", "waiting_for_input"]);
  if (!run) return;
  const key = req.params.key;
  let question = run.questions.find((q) => q.key === key);
  if (!question) return next(new ErrorHandler("Question not found", 404));

  if (question.status === "pending" && question.expiresAt && question.expiresAt < new Date()) {
    const updated = await QaRun.findOneAndUpdate(
      { _id: run._id, questions: { $elemMatch: { key, status: "pending" } } },
      {
        $set: { "questions.$.status": "expired" },
        $push: { messages: { from: "system", type: "status", text: `No answer to ${key} in time — the agent will mark that check as not verified.`, questionKey: key } },
      },
      { new: true }
    ).lean();
    if (updated) {
      let status = updated.status;
      if (status === "waiting_for_input" && !updated.questions.some((q) => q.status === "pending")) {
        const resumed = await QaRun.updateOne({ _id: run._id, status: "waiting_for_input" }, { $set: { status: "running" } });
        if (resumed.modifiedCount) status = "running";
      }
      notifyQaRun(run._id, "question_expired", status);
      question = updated.questions.find((q) => q.key === key);
    } else {
      // Answered in the same instant — read the answer.
      const fresh = await QaRun.findById(run._id).select("questions").lean();
      question = fresh.questions.find((q) => q.key === key);
    }
  }

  res.status(200).json({ success: true, question });
});

/**
 * POST /api/v1/qa-agent/runs/:id/results   { results: [{ key, status, detail, location }] }
 * Records (or overwrites) results for approved plan items. Can be called many
 * times as tests finish, so the admin sees results arrive live.
 */
const submitResults = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["running", "waiting_for_input"]);
  if (!run) return;
  if (!Array.isArray(req.body.results) || req.body.results.length === 0) {
    return next(new ErrorHandler("results must be a non-empty array", 400));
  }

  const planned = new Map(run.plan.items.filter((i) => i.included).map((i) => [i.key, i]));
  const byKey = new Map(run.results.map((r) => [r.key, r]));
  for (const raw of req.body.results) {
    const key = str(raw?.key, 20);
    const item = planned.get(key);
    if (!item) return next(new ErrorHandler(`${key || "(missing key)"} is not an approved test in this plan`, 400));
    if (!QaRun.RESULT_STATUSES.includes(raw.status)) {
      return next(new ErrorHandler(`Result ${key}: status must be one of ${QaRun.RESULT_STATUSES.join(", ")}`, 400));
    }
    byKey.set(key, { key, title: item.title, status: raw.status, detail: str(raw.detail, 4000), location: str(raw.location, 300) });
  }

  const updated = await QaRun.findOneAndUpdate(
    { _id: run._id, lockedBy: req.qaWorkerId, status: { $in: ["running", "waiting_for_input"] } },
    { $set: { results: [...byKey.values()] } },
    { new: true }
  ).select("results").lean();
  if (!updated) return next(new ErrorHandler("The run changed while saving results", 409));

  notifyQaRun(run._id, "results", run.status);
  res.status(200).json({ success: true, results: updated.results });
});

/**
 * POST /api/v1/qa-agent/runs/:id/finish   { status: "done"|"failed", reportSummary, error?, costUsd? }
 * Ends the run. Any approved test with no result is recorded as "skipped" so
 * nothing silently disappears from the report, and open questions expire.
 */
const finishRun = catchAsyncError(async (req, res, next) => {
  const run = await loadOwnedRun(req, next, ["exploring", "running", "waiting_for_input"]);
  if (!run) return;

  const status = req.body.status;
  if (!["done", "failed"].includes(status)) return next(new ErrorHandler('status must be "done" or "failed"', 400));
  if (status === "done" && run.status === "exploring") {
    return next(new ErrorHandler('A run can only be "done" after its tests ran — use "failed" to abandon planning', 400));
  }
  const reportSummary = str(req.body.reportSummary, 8000);
  const error = str(req.body.error, 2000);
  if (status === "done" && !reportSummary) return next(new ErrorHandler("reportSummary is required", 400));
  if (status === "failed" && !error) return next(new ErrorHandler("error is required when failing a run", 400));

  const reported = new Set(run.results.map((r) => r.key));
  const missing = run.status === "exploring" ? [] : run.plan.items
    .filter((i) => i.included && !reported.has(i.key))
    .map((i) => ({ key: i.key, title: i.title, status: "skipped", detail: "No result was reported for this test." }));
  const questions = run.questions.map((q) => (q.status === "pending" ? { ...q, status: "expired" } : q));

  const update = {
    $set: {
      status,
      reportSummary,
      error,
      questions,
      results: [...run.results, ...missing],
      finishedAt: new Date(),
      lockedBy: "",
      lockedAt: null,
    },
    $push: {
      messages: status === "done"
        ? { from: "agent", type: "report", text: reportSummary }
        : { from: "agent", type: "status", text: `Run failed: ${error}` },
    },
  };
  const cost = Number(req.body.costUsd);
  if (Number.isFinite(cost) && cost >= 0) update.$max = { costUsd: cost };

  const updated = await QaRun.findOneAndUpdate(
    { _id: run._id, lockedBy: req.qaWorkerId, status: run.status },
    update,
    { new: true }
  ).lean();
  if (!updated) return next(new ErrorHandler("The run changed while finishing", 409));

  notifyQaRun(updated._id, "finished", updated.status);
  res.status(200).json({ success: true, run: updated });
});

/**
 * POST /api/v1/qa-agent/test-data/cleanup
 * Deletes data the QA agent created in QA test mode. Only ever matches
 * isQaTest: true, so real leads can't be touched whatever the agent does.
 * Covers every collection that has QA test mode so far.
 */
const cleanupTestData = catchAsyncError(async (req, res) => {
  const PropertyLead = require("../../model/leads/propertyLeadModel");
  const LeadNote = require("../../model/leads/leadNoteModel");

  const leadIds = (await PropertyLead.find({ isQaTest: true }).select("_id").lean()).map((l) => l._id);
  const [leads, notes] = await Promise.all([
    PropertyLead.deleteMany({ isQaTest: true, _id: { $in: leadIds } }),
    LeadNote.deleteMany({ leadType: "property", leadId: { $in: leadIds } }),
  ]);

  res.status(200).json({ success: true, deleted: { propertyLeads: leads.deletedCount, leadNotes: notes.deletedCount } });
});

const QA_SESSION_HOURS = 1;

/**
 * POST /api/v1/qa-agent/test-sessions   { role: "user" | "admin" }
 * Returns a short-lived login token for the QA agent's own account of that
 * role (created on first use). The worker keeps the token; the model never
 * sees it. The account has a random password nobody knows, and the admin one
 * is read-only (middleware/auth.js), so this can't be used to change anything.
 */
const createTestSession = catchAsyncError(async (req, res, next) => {
  const role = req.body?.role;
  if (!["user", "admin"].includes(role)) return next(new ErrorHandler('role must be "user" or "admin"', 400));

  const crypto = require("crypto");
  const jwt = require("jsonwebtoken");
  const User = require("../../model/users/userModel");

  const email = `qa-agent-${role}@vihara-qa.test`;
  let user = await User.findOne({ email });
  if (user && !user.isQaAccount) {
    return next(new ErrorHandler(`${email} exists but is not a QA account — refusing to issue a session`, 409));
  }
  if (!user) {
    try {
      user = await User.create({
        name: "QA Agent",
        last_name: "Test",
        email,
        role,
        isQaAccount: true,
        password: crypto.randomBytes(32).toString("hex"), // hashed on save, never stored in plain text
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      user = await User.findOne({ email }); // created by a concurrent request
    }
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.secret, { expiresIn: `${QA_SESSION_HOURS}h` });
  res.status(200).json({
    success: true,
    token,
    expiresAt: new Date(Date.now() + QA_SESSION_HOURS * 3600 * 1000),
    user: { id: user._id, email: user.email, role: user.role },
  });
});

/** GET /api/v1/qa-agent/knowledge — facts remembered from earlier runs. */
const getKnowledge = catchAsyncError(async (req, res) => {
  const facts = await QaKnowledge.find().select("key value description").sort({ key: 1 }).lean();
  res.status(200).json({ success: true, facts });
});

module.exports = {
  claimRun,
  heartbeat,
  submitPlan,
  clarifyRequest,
  postMessage,
  askQuestion,
  getQuestion,
  submitResults,
  finishRun,
  getKnowledge,
  cleanupTestData,
  createTestSession,
  LOCK_STALE_MS,
};
