// controller/calling/facetimeAgentController.js
//
// What the Mac agent talks to (FaceTime test). Mounted at
// /api/v1/facetime/agent (routes/calling/facetimeRoutes.js). The agent proves
// which Mac it is with its own key: "Authorization: Bearer <key>". The key is
// made in the admin panel and shown once; we keep only its sha256.
const crypto = require("crypto");
const VtextLine = require("../../model/vtext/vtextLineModel");
const { claimNextJob, reportStatus, markAnswered, alert } = require("../../services/calling/facetime/facetimeCallService");

const hashKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");

/** Finds the Mac by its key, or answers 401. */
async function requireAgent(req, res, next) {
  try {
    const key = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!key) return res.status(401).json({ success: false, message: "Missing agent key" });
    const line = await VtextLine.findOne({ "facetime.agentKeyHash": hashKey(key) }).select("_id name status facetime");
    if (!line) return res.status(401).json({ success: false, message: "Unknown agent key" });
    req.facetimeLine = line;
    next();
  } catch (err) {
    next(err);
  }
}

/** POST /heartbeat — "I'm alive". Every 30 seconds. */
async function heartbeat(req, res, next) {
  try {
    const line = req.facetimeLine;
    const wasOffline = !!line.facetime?.offlineAlertedAt;
    await VtextLine.updateOne(
      { _id: line._id },
      { $set: { "facetime.lastHeartbeatAt": new Date(), "facetime.agentVersion": String(req.body?.agentVersion || "").slice(0, 40), "facetime.offlineAlertedAt": null } }
    );
    if (wasOffline) await alert("info", "Mac is checking in again", [{ label: "Mac", value: line.name }]);
    res.json({ success: true, facetimeEnabled: !!line.facetime?.enabled, lineName: line.name });
  } catch (err) {
    next(err);
  }
}

/** POST /jobs/next — the next call for this Mac, or { job: null }. */
async function nextJob(req, res, next) {
  try {
    const line = req.facetimeLine;
    if (!line.facetime?.enabled) return res.json({ success: true, job: null });
    const job = await claimNextJob(line._id);
    res.json({ success: true, job: job ? { id: String(job._id), phone: job.phone, fullName: job.fullName } : null });
  } catch (err) {
    next(err);
  }
}

/** POST /jobs/:id/status { status, note } — dialing | ringing | no-answer | declined | failed | ended */
async function jobStatus(req, res, next) {
  try {
    const { status, note } = req.body || {};
    let job;
    try {
      job = await reportStatus(req.facetimeLine._id, req.params.id, status, String(note || "").slice(0, 500));
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!job) return res.status(409).json({ success: false, message: "That job isn't in a state where this change applies" });
    res.json({ success: true, status: job.status });
  } catch (err) {
    next(err);
  }
}

/** POST /jobs/:id/answered — they picked up. Returns Maya's websocket link. */
async function jobAnswered(req, res, next) {
  try {
    let result;
    try {
      result = await markAnswered(req.facetimeLine._id, req.params.id);
    } catch (err) {
      return res.status(502).json({ success: false, message: err.message }); // the Mac should hang up politely
    }
    if (!result) return res.status(409).json({ success: false, message: "That job isn't waiting for an answer" });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAgent, heartbeat, nextJob, jobStatus, jobAnswered, hashKey };
