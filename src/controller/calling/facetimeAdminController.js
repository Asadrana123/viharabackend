// controller/calling/facetimeAdminController.js
//
// Admin panel side of the FaceTime test: the on/off switch and test group,
// FaceTime per Mac, the Mac agent's key, and FaceTime vs phone pick-up rates.
// Mounted at /api/v1/facetime/admin (routes/calling/facetimeRoutes.js).
const crypto = require("crypto");
const mongoose = require("mongoose");
const VtextLine = require("../../model/vtext/vtextLineModel");
const FacetimeCallJob = require("../../model/calling/facetimeCallJobModel");
const CallLog = require("../../model/calling/callLogModel");
const { isServerEnabled, getSettings, updateSettings } = require("../../services/calling/facetime/facetimeSettingsService");
const { HEARTBEAT_FRESH_MS } = require("../../services/calling/facetime/facetimeRouter");
const { hashKey } = require("./facetimeAgentController");

const STATS_DAYS = 30;
// Named one by one: the key hash is select:false, and asking for "facetime" plus it collides.
const LINE_FIELDS = "name address status facetime.enabled facetime.lastHeartbeatAt facetime.agentVersion facetime.consecutiveFailures facetime.pausedReason +facetime.agentKeyHash";

// Same "did not reach a person" reasons the follow-up loops use (registrationCallService).
const NO_PICKUP_REASONS = [
  "no-answer", "customer-did-not-answer", "customer-busy", "silence-timed-out", "voicemail",
  "call-start-error", "twilio-failed-to-connect-call", "pipeline-error",
];

function lineView(line) {
  const ft = line.facetime || {};
  return {
    _id: line._id,
    name: line.name,
    address: line.address,
    status: line.status,
    facetime: {
      enabled: !!ft.enabled,
      online: !!ft.lastHeartbeatAt && Date.now() - new Date(ft.lastHeartbeatAt).getTime() < HEARTBEAT_FRESH_MS,
      lastHeartbeatAt: ft.lastHeartbeatAt || null,
      agentVersion: ft.agentVersion || "",
      consecutiveFailures: ft.consecutiveFailures || 0,
      pausedReason: ft.pausedReason || "",
      hasAgentKey: !!ft.agentKeyHash,
    },
  };
}

async function buildStats() {
  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000);

  const byStatus = await FacetimeCallJob.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const ft = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
  const answered = (ft.answered || 0) + (ft.ended || 0);
  // Pick-up rate only counts calls that actually rang over FaceTime.
  const rang = answered + (ft["no-answer"] || 0) + (ft.declined || 0);

  const phoneTotal = await CallLog.countDocuments({ createdAt: { $gte: since }, channel: { $ne: "facetime" } });
  const phoneNoPickup = await CallLog.countDocuments({ createdAt: { $gte: since }, channel: { $ne: "facetime" }, endedReason: { $in: NO_PICKUP_REASONS } });

  return {
    days: STATS_DAYS,
    facetime: {
      total: Object.values(ft).reduce((a, b) => a + b, 0),
      rang,
      answered,
      noAnswer: ft["no-answer"] || 0,
      declined: ft.declined || 0,
      fellBack: ft["fell-back"] || 0,
      failed: ft.failed || 0,
      pickupRate: rang ? answered / rang : null,
    },
    phone: {
      total: phoneTotal,
      answered: phoneTotal - phoneNoPickup,
      pickupRate: phoneTotal ? (phoneTotal - phoneNoPickup) / phoneTotal : null,
    },
  };
}

/** GET /overview — everything the FaceTime test card shows. Works even when the server switch is off, so the card can say so. */
async function getOverview(req, res, next) {
  try {
    if (!isServerEnabled()) return res.json({ success: true, serverEnabled: false });
    const [settings, lines, recentJobs, stats] = await Promise.all([
      getSettings({ fresh: true }),
      VtextLine.find({ status: { $ne: "retired" }, channelType: "imessage-bluebubbles" })
        .select(LINE_FIELDS)
        .sort({ createdAt: 1 })
        .lean(),
      FacetimeCallJob.find({})
        .sort({ createdAt: -1 })
        .limit(25)
        .select("phone fullName source status channelUsed failureReason createdAt answeredAt finishedAt lineId")
        .lean(),
      buildStats(),
    ]);
    res.json({ success: true, serverEnabled: true, settings, lines: lines.map(lineView), recentJobs, stats });
  } catch (err) {
    next(err);
  }
}

/** PATCH /settings — { enabled, mode, allowlist, percent, maxCallsPerHourPerLine } */
async function patchSettings(req, res, next) {
  try {
    let settings;
    try {
      settings = await updateSettings(req.body || {}, req.user);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
}

/** PATCH /lines/:id — { enabled } turns FaceTime on/off for one Mac. Turning on clears an automatic pause. */
async function patchLine(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid line id" });
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ success: false, message: "enabled must be true or false" });
    const set = { "facetime.enabled": req.body.enabled };
    if (req.body.enabled) Object.assign(set, { "facetime.pausedReason": "", "facetime.consecutiveFailures": 0 });
    const line = await VtextLine.findOneAndUpdate({ _id: req.params.id }, { $set: set }, { new: true })
      .select(LINE_FIELDS)
      .lean();
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });
    res.json({ success: true, line: lineView(line) });
  } catch (err) {
    next(err);
  }
}

/** POST /lines/:id/agent-key — makes a new key for this Mac's agent (the old one stops working). Shown once. */
async function createAgentKey(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid line id" });
    const key = `ftk_${crypto.randomBytes(24).toString("hex")}`;
    const result = await VtextLine.updateOne({ _id: req.params.id }, { $set: { "facetime.agentKeyHash": hashKey(key) } });
    if (!result.matchedCount) return res.status(404).json({ success: false, message: "Line not found" });
    res.json({ success: true, agentKey: key });
  } catch (err) {
    next(err);
  }
}

module.exports = { getOverview, patchSettings, patchLine, createAgentKey };
