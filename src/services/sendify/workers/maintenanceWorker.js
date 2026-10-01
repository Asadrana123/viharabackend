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

const JOB_HANDLERS = {
  "noop-heartbeat": runNoopHeartbeat,
  "stuck-message-sweep": runStuckMessageSweep,
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
