// routes/qa/qaAdminRoutes.js
//
// Mounted at /api/v1/qa (see app.js). Admin-only: start QA agent runs,
// review/approve plans, answer the agent's questions, manage what it remembers.
const express = require("express");
const router = express.Router();

const {
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
} = require("../../controller/qa/qaAdminController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

router.post("/runs", createRun);
router.get("/runs", listRuns);
router.get("/runs/:id", getRun);
router.post("/runs/:id/approve", approvePlan);
router.post("/runs/:id/feedback", sendFeedback);
router.post("/runs/:id/questions/:key/answer", answerQuestion);
router.post("/runs/:id/cancel", cancelRun);

router.get("/knowledge", listKnowledge);
router.put("/knowledge/:key", upsertKnowledge);
router.delete("/knowledge/:key", deleteKnowledge);

module.exports = router;
