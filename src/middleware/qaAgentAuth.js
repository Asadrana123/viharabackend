// middleware/qaAgentAuth.js
//
// Guards the QA worker API (/api/v1/qa-agent). The worker is a separate
// process, not a logged-in user, so it authenticates with a shared secret in
// the `x-qa-agent-token` header instead of the `token` cookie.
//
// Inert unless QA_AGENT_TOKEN is set: every worker route returns 503, the same
// "feature stays off until configured" pattern as middleware/vtextEnabled.js.
const crypto = require("crypto");

const MIN_TOKEN_LENGTH = 32;

const isQaAgentConfigured = () => (process.env.QA_AGENT_TOKEN || "").length >= MIN_TOKEN_LENGTH;

/** True when the request carries the configured QA agent token. */
function hasValidQaAgentToken(req) {
  if (!isQaAgentConfigured()) return false;
  const given = req.get("x-qa-agent-token") || "";
  if (!given) return false;
  // Hash both sides so timingSafeEqual always compares equal-length buffers.
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(process.env.QA_AGENT_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireQaAgentToken(req, res, next) {
  if (!isQaAgentConfigured()) {
    return res.status(503).json({ success: false, message: "QA agent is not configured (QA_AGENT_TOKEN missing or too short)" });
  }
  if (!hasValidQaAgentToken(req)) {
    return res.status(401).json({ success: false, message: "Invalid QA agent token" });
  }

  const workerId = (req.get("x-qa-worker-id") || "").trim();
  if (!/^[\w.:-]{1,64}$/.test(workerId)) {
    return res.status(400).json({ success: false, message: "x-qa-worker-id header is required (1-64 chars: letters, numbers, _ . : -)" });
  }
  req.qaWorkerId = workerId;
  next();
}

/**
 * QA test mode for public endpoints the QA agent exercises. A request carrying
 * the valid QA agent token gets req.isQaTest = true: the controller marks what
 * it creates as QA test data and skips real-world side effects (calls, Slack,
 * paid enrichment, Brevo, texts). Without the token — or with a wrong one —
 * the request is treated exactly like any visitor's; it is never rejected here.
 */
function markQaTestRequest(req, res, next) {
  req.isQaTest = hasValidQaAgentToken(req);
  next();
}

module.exports = { requireQaAgentToken, markQaTestRequest, hasValidQaAgentToken };
