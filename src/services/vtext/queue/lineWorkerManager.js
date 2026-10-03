// services/vtext/queue/lineWorkerManager.js
//
// Phase 2 scope (sendify-infra.md §4.5): poll every 60s (no pub/sub trigger
// yet — that needs the events bus, Phase 4/5) and reconcile one BullMQ
// Worker per ROUTABLE line, each with that line's own perMinute rate
// limiter. A line leaving the routable set (paused/quarantined/offline/
// retired) gets its worker closed — Phase 4 adds the more careful
// pause-vs-close distinction (draining waiting jobs back to routing, an
// "offline" grace period before draining). This version just stops
// processing new jobs for a non-routable line; nothing is lost, jobs simply
// sit in that line's queue until the line is routable again or Phase 4's
// real drain logic exists.
const { Worker } = require("bullmq");
const VtextLine = require("../../../model/vtext/vtextLineModel");
const { ROUTABLE_STATUSES } = VtextLine;
const { bullmqConnection } = require("./connection");
const { QUEUE_PREFIX, lineQueueName } = require("./queues");
const { processSendJob } = require("../workers/lineSendWorker");
const { limitsFor } = require("../vtextCapacityService");

const RECONCILE_INTERVAL_MS = 60_000;

const activeWorkers = new Map(); // lineId (string) -> { worker, perMinute }

function workerOptsFor(line) {
  const { perMinute } = limitsFor(line);
  return {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 1, // a line can only hold one live send at a time anyway (D3)
    limiter: { max: 1, duration: Math.max(1, Math.ceil(60_000 / Math.max(1, perMinute))) },
  };
}

async function reconcile() {
  const routableLines = await VtextLine.find({ status: { $in: ROUTABLE_STATUSES } });
  const routableIds = new Set(routableLines.map((l) => String(l._id)));

  for (const line of routableLines) {
    const id = String(line._id);
    const { perMinute } = limitsFor(line);
    const existing = activeWorkers.get(id);

    if (!existing) {
      const worker = new Worker(lineQueueName(id), (job) => processSendJob(id, job), workerOptsFor(line));
      worker.on("failed", (job, err) => {
        console.error(`[vtext line-send] line ${id} job ${job?.id} failed:`, err.message);
      });
      activeWorkers.set(id, { worker, perMinute });
    } else if (existing.perMinute !== perMinute) {
      // BullMQ's limiter is fixed at Worker construction — a changed rate
      // means closing and recreating, not mutating in place.
      await existing.worker.close();
      const worker = new Worker(lineQueueName(id), (job) => processSendJob(id, job), workerOptsFor(line));
      worker.on("failed", (job, err) => {
        console.error(`[vtext line-send] line ${id} job ${job?.id} failed:`, err.message);
      });
      activeWorkers.set(id, { worker, perMinute });
    }
  }

  // Anything no longer routable loses its worker (jobs stay queued, untouched).
  for (const [id, { worker }] of activeWorkers.entries()) {
    if (!routableIds.has(id)) {
      await worker.close();
      activeWorkers.delete(id);
    }
  }
}

let reconcileTimer = null;

async function startLineWorkerManager() {
  await reconcile();
  reconcileTimer = setInterval(() => {
    reconcile().catch((err) => console.error("[vtext line-worker-manager] reconcile failed:", err));
  }, RECONCILE_INTERVAL_MS);
}

async function stopLineWorkerManager() {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  for (const [, { worker }] of activeWorkers.entries()) {
    await worker.close();
  }
  activeWorkers.clear();
}

module.exports = { startLineWorkerManager, stopLineWorkerManager, reconcile };
