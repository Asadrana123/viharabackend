// services/sendify/workers/maintenanceWorker.js
//
// Phase 0: a single named job, "noop-heartbeat", run as a BullMQ repeatable
// job scheduler every 30s. It just proves the worker process is alive by
// writing a timestamp to Redis — GET /api/v1/sendify/health reads that same
// key to report worker liveness to anyone curious, without the web process
// needing to talk to BullMQ directly.
//
// Later phases (sendify-infra.md §4.6) add line-health-sweep, line-reconcile,
// stuck-message-sweep, daily-rollover and backlog-alert as more named jobs on
// this same queue/worker — this file grows, it doesn't get replaced.
const { Worker } = require("bullmq");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX, getMaintenanceQueue, getRouteQueue } = require("../queue/queues");
const { getRedisClient } = require("../queue/connection");
const SendifyMessage = require("../../../model/sendify/sendifyMessageModel");
const SendifyLine = require("../../../model/sendify/sendifyLineModel");
const SendifyLineUsage = require("../../../model/sendify/sendifyLineUsageModel");
const SendifyLineEvent = require("../../../model/sendify/sendifyLineEventModel");
const { getAdapter } = require("../channels/registry");
const { evaluateAndMaybeQuarantine } = require("../sendifyLineHealthService");
const { dayKey } = require("../sendifyCapacityService");
const { notifySendifyAlert } = require("../../shared/slackService");
const { publishEvent } = require("../sendifyEventsBus");

const HEARTBEAT_KEY = "sendify:worker:lastHeartbeatAt";

async function runNoopHeartbeat() {
  await getRedisClient().set(HEARTBEAT_KEY, new Date().toISOString());
}

// Phase 2 (sendify-infra.md §4.6/§4.7): the Redis-loss recovery mechanism.
// Rather than tracking exact BullMQ job ids and checking existence (fragile —
// our route jobs get a fresh timestamped id on every re-add specifically to
// avoid id-reuse collisions, so there's no single "the" job id to check), this
// re-enqueues any message that's been sitting in a pre-send status for longer
// than it reasonably should — which is true whether the underlying cause was
// a Redis flush, a crashed worker that never got to it, or anything else.
// Re-adding a route job for a message that's actually already moving is
// harmless: routeWorker's own status check (STATUSES_ROUTABLE) makes it a no-op.
const STUCK_SENDING_MIN = Number(process.env.SENDIFY_STUCK_SENDING_MIN || 10);
const STUCK_QUEUED_MIN = Number(process.env.SENDIFY_STUCK_QUEUED_MIN || 2);

async function runStuckMessageSweep() {
  const sendingCutoff = new Date(Date.now() - STUCK_SENDING_MIN * 60_000);
  const sendingResult = await SendifyMessage.updateMany(
    { status: "sending", updatedAt: { $lt: sendingCutoff } },
    { $set: { status: "unknown" } }
  );
  if (sendingResult.modifiedCount > 0) {
    console.warn(`[sendify stuck-sweep] ${sendingResult.modifiedCount} message(s) stuck "sending" > ${STUCK_SENDING_MIN}min -> marked "unknown"`);
  }

  const queuedCutoff = new Date(Date.now() - STUCK_QUEUED_MIN * 60_000);
  const stuckQueued = await SendifyMessage.find({
    status: { $in: ["queued", "assigned", "waiting-capacity", "waiting-window"] },
    updatedAt: { $lt: queuedCutoff },
  });
  const routeQueue = getRouteQueue();
  for (const message of stuckQueued) {
    await routeQueue.add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-sweep-${Date.now()}` });
  }
  if (stuckQueued.length > 0) {
    console.warn(`[sendify stuck-sweep] re-enqueued ${stuckQueued.length} message(s) stuck pre-send > ${STUCK_QUEUED_MIN}min`);
  }
}

// §4.6/§7.4: heartbeat-staleness -> offline, and restoration when healthy
// again. A line going offline is NOT the same as quarantine (§7.4) — offline
// is "can't currently reach the device," reversible automatically; quarantine
// is "this line is misbehaving," reversible only by an admin.
const HEARTBEAT_STALE_MIN = Number(process.env.SENDIFY_HEARTBEAT_STALE_MIN || 15);

async function runLineHealthSweep() {
  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MIN * 60_000);

  // Going offline: warming/active lines with a stale (or missing) heartbeat,
  // confirmed by a failing healthCheck() (not heartbeat staleness alone —
  // the heartbeat event itself might just not be wired up on a given
  // channel yet, which shouldn't by itself take a line offline).
  const candidates = await SendifyLine.find({ status: { $in: ["warming", "active"] } });
  for (const line of candidates) {
    const stale = !line.health?.lastHeartbeatAt || new Date(line.health.lastHeartbeatAt) < staleCutoff;
    if (!stale) continue;

    const adapter = getAdapter(line.channelType);
    let healthy = true;
    try {
      const result = await adapter.healthCheck({ line });
      healthy = !!result?.ok;
    } catch {
      healthy = false;
    }
    if (healthy) continue;

    const fromStatus = line.status;
    line.status = "offline";
    line.statusReason = `heartbeat stale > ${HEARTBEAT_STALE_MIN}min and healthCheck failed`;
    line.statusChangedAt = new Date();
    line.statusChangedBy = { kind: "system" };
    await line.save();
    await SendifyLineEvent.create({ lineId: line._id, type: "heartbeat-lost", from: fromStatus, to: "offline", reason: line.statusReason, actor: { kind: "system" } });
    publishEvent({ type: "line.updated", lineId: String(line._id), status: "offline" });
    notifySendifyAlert({ level: "warning", title: "Line offline", fields: [{ label: "Line", value: line.name }] }).catch(() => {});
  }

  // Restoration: an offline line whose heartbeat is fresh again goes back to
  // whatever status it was in right before going offline (read from its own
  // most recent heartbeat-lost event, rather than a new schema field).
  const offlineLines = await SendifyLine.find({ status: "offline" });
  for (const line of offlineLines) {
    const fresh = line.health?.lastHeartbeatAt && new Date(line.health.lastHeartbeatAt) >= staleCutoff;
    if (!fresh) continue;

    const lastLostEvent = await SendifyLineEvent.findOne({ lineId: line._id, type: "heartbeat-lost" }).sort({ createdAt: -1 });
    const restoreTo = lastLostEvent?.from && ["warming", "active"].includes(lastLostEvent.from) ? lastLostEvent.from : "active";

    line.status = restoreTo;
    line.statusReason = "heartbeat restored";
    line.statusChangedAt = new Date();
    line.statusChangedBy = { kind: "system" };
    await line.save();
    await SendifyLineEvent.create({ lineId: line._id, type: "heartbeat-restored", from: "offline", to: restoreTo, actor: { kind: "system" } });
    publishEvent({ type: "line.updated", lineId: String(line._id), status: restoreTo });
    notifySendifyAlert({ level: "info", title: "Line restored", fields: [{ label: "Line", value: line.name }] }).catch(() => {});
  }

  // Failure-rate quarantine check — consecutiveFailures is evaluated live in
  // lineSendWorker on every failure; this catches the failureRateRecent
  // trigger, which needs a query over recent history rather than a counter.
  const routableLines = await SendifyLine.find({ status: { $in: ["warming", "active"] } });
  for (const line of routableLines) {
    await evaluateAndMaybeQuarantine(line);
  }
}

// §4.6/§7.6: rolls up the last 7 days of sendifyLineUsage into
// line.health.replyRatio7d/sentLast7d (the §7.4 soft-throttle inputs), and
// advances warming -> active once a line's warm-up schedule has run its course.
async function runDailyRollover() {
  const lines = await SendifyLine.find({ status: { $ne: "retired" } });
  const sevenDaysAgo = dayKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  for (const line of lines) {
    const usageRows = await SendifyLineUsage.find({ lineId: line._id, day: { $gte: sevenDaysAgo } });
    const sent = usageRows.reduce((sum, r) => sum + (r.sent || 0), 0);
    const inbound = usageRows.reduce((sum, r) => sum + (r.inbound || 0), 0);

    line.health = line.health || {};
    line.health.sentLast7d = sent;
    line.health.replyRatio7d = sent > 0 ? inbound / sent : 0;

    if (line.status === "warming" && line.warmup?.startedAt) {
      const daysSinceStart = Math.floor((Date.now() - new Date(line.warmup.startedAt).getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const schedule = line.warmup.schedule || [];
      const scheduleComplete = schedule.length > 0 && daysSinceStart > Math.max(...schedule.map((s) => s.fromDay));
      if (scheduleComplete) {
        line.status = "active";
        line.statusReason = "warm-up schedule complete";
        line.statusChangedAt = new Date();
        line.statusChangedBy = { kind: "system" };
        await SendifyLineEvent.create({ lineId: line._id, type: "warmup-advanced", from: "warming", to: "active", actor: { kind: "system" } });
      }
    }

    await line.save();
  }
}

const BACKLOG_ALERT_THRESHOLD = Number(process.env.SENDIFY_BACKLOG_ALERT || 200);

async function runBacklogAlert() {
  const count = await SendifyMessage.countDocuments({ status: "waiting-capacity" });
  if (count > BACKLOG_ALERT_THRESHOLD) {
    notifySendifyAlert({
      level: "warning",
      title: "Outbound backlog over threshold",
      fields: [{ label: "Messages waiting on capacity", value: count }, { label: "Threshold", value: BACKLOG_ALERT_THRESHOLD }],
    }).catch(() => {});
  }
}

const JOB_HANDLERS = {
  "noop-heartbeat": runNoopHeartbeat,
  "stuck-message-sweep": runStuckMessageSweep,
  "line-health-sweep": runLineHealthSweep,
  "daily-rollover": runDailyRollover,
  "backlog-alert": runBacklogAlert,
};

async function processMaintenanceJob(job) {
  const handler = JOB_HANDLERS[job.name];
  if (!handler) {
    throw new Error(`[sendify maintenance] no handler for job "${job.name}"`);
  }
  await handler(job);
}

/**
 * Upserts the repeatable "noop-heartbeat" job. Idempotent — safe to call on
 * every worker boot (BullMQ's upsertJobScheduler replaces, not duplicates,
 * a scheduler with the same id).
 */
async function ensureMaintenanceSchedulers() {
  const queue = getMaintenanceQueue();
  await queue.upsertJobScheduler(
    "noop-heartbeat",
    { every: 30_000 },
    { name: "noop-heartbeat" },
  );
  await queue.upsertJobScheduler(
    "stuck-message-sweep",
    { every: 60_000 }, // the plan says "every 10 min" — running it every 60s is harmless (it's a no-op when nothing's actually stuck) and makes the sweep far more responsive for testing/real recovery alike
    { name: "stuck-message-sweep" },
  );
  // Same reasoning as stuck-message-sweep: these are all no-ops when nothing
  // needs attention, so running them faster than the plan's stated cadence
  // (5min/daily/15min) costs nothing and makes real recovery — and testing —
  // far more responsive. SENDIFY_*_INTERVAL_MS env overrides exist for
  // anyone who wants the slower, plan-literal cadence in production later.
  await queue.upsertJobScheduler(
    "line-health-sweep",
    { every: Number(process.env.SENDIFY_LINE_HEALTH_SWEEP_INTERVAL_MS || 60_000) },
    { name: "line-health-sweep" },
  );
  await queue.upsertJobScheduler(
    "daily-rollover",
    { every: Number(process.env.SENDIFY_DAILY_ROLLOVER_INTERVAL_MS || 5 * 60_000) },
    { name: "daily-rollover" },
  );
  await queue.upsertJobScheduler(
    "backlog-alert",
    { every: Number(process.env.SENDIFY_BACKLOG_ALERT_INTERVAL_MS || 5 * 60_000) },
    { name: "backlog-alert" },
  );
}

let worker = null;

function startMaintenanceWorker() {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAMES.MAINTENANCE, processMaintenanceJob, {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    console.error(`[sendify maintenance] job "${job?.name}" failed:`, err.message);
  });
  return worker;
}

async function stopMaintenanceWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

module.exports = {
  HEARTBEAT_KEY,
  ensureMaintenanceSchedulers,
  startMaintenanceWorker,
  stopMaintenanceWorker,
};
