// services/sendify/queue/queues.js
//
// Singleton Queue instances, created once at module load — never inside a
// request handler (the sibling google-hackathon-aivideogen project does that
// per-request, which opens a new Redis connection per call; sendify-infra.md
// §0 item 7 explicitly calls this out as the anti-pattern to avoid).
//
// Phase 0 only needs sendify-maintenance (for the heartbeat scheduler).
// sendify-route / sendify-inbound / per-line sendify-line-<id> queues are
// added in Phase 2/3 — see sendify-infra.md §4.1/§4.2.
const { Queue } = require("bullmq");
const { bullmqConnection } = require("./connection");

const QUEUE_PREFIX = "vihara"; // namespaces Sendify's keys from any other project sharing this Redis

const QUEUE_NAMES = {
  MAINTENANCE: "sendify-maintenance",
  // Added in later phases:
  // ROUTE: "sendify-route",
  // INBOUND: "sendify-inbound",
};

const DEFAULT_QUEUE_OPTS = {
  connection: bullmqConnection(),
  prefix: QUEUE_PREFIX,
};

let maintenanceQueue = null;
function getMaintenanceQueue() {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, DEFAULT_QUEUE_OPTS);
  }
  return maintenanceQueue;
}

/** Closes every singleton queue's connection — called on worker/web SIGTERM. */
async function closeAllQueues() {
  if (maintenanceQueue) await maintenanceQueue.close();
}

module.exports = {
  QUEUE_PREFIX,
  QUEUE_NAMES,
  DEFAULT_QUEUE_OPTS,
  getMaintenanceQueue,
  closeAllQueues,
};
