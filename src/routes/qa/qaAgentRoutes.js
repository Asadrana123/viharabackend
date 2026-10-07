// routes/qa/qaAgentRoutes.js
//
// Mounted at /api/v1/qa-agent (see app.js). Used only by the QA worker
// process, authenticated with the x-qa-agent-token header — not by browsers.
// Returns 503 for everything until QA_AGENT_TOKEN is set.
const express = require("express");
const router = express.Router();

const {
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
} = require("../../controller/qa/qaAgentController");
const { requireQaAgentToken } = require("../../middleware/qaAgentAuth");

router.use(requireQaAgentToken);

router.post("/claim", claimRun);
router.get("/knowledge", getKnowledge);
router.post("/test-data/cleanup", cleanupTestData);
router.post("/test-sessions", createTestSession);

router.post("/runs/:id/heartbeat", heartbeat);
router.post("/runs/:id/plan", submitPlan);
router.post("/runs/:id/clarify", clarifyRequest);
router.post("/runs/:id/messages", postMessage);
router.post("/runs/:id/questions", askQuestion);
router.get("/runs/:id/questions/:key", getQuestion);
router.post("/runs/:id/results", submitResults);
router.post("/runs/:id/finish", finishRun);

module.exports = router;
