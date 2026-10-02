// services/sendify/queue/queues.js
//
// Singleton Queue instances, created once at module load — never inside a
// request handler (the sibling google-hackathon-aivideogen project does that
// per-request, which opens a new Redis connection per call; sendify-infra.md
// §0 item 7 explicitly calls this out as the anti-pattern to avoid).
//
// Phase 0: sendify-maintenance. Phase 2: sendify-route + one
// sendify-line-<lineId> queue per line (created on demand via
// getLineQueue, cached, never recreated per-request). Phase 3:
// sendify-inbound. See sendify-infra.md §4.1/§4.2.
const { Queue } = require("bullmq");
const { bullmqConnection } = require("./connection");

const QUEUE_PREFIX = "vihara"; // namespaces Sendify's keys from any other project sharing this Redis

const QUEUE_NAMES = {
  MAINTENANCE: "sendify-maintenance",
  ROUTE: "sendify-route",
  INBOUND: "sendify-inbound",
  DRAFT_REPLY: "sendify-draft-reply",
};

const DEFAULT_QUEUE_OPTS = {
  connection: bullmqConnection(),
  prefix: QUEUE_PREFIX,
};

// Retention: Mongo is the permanent record (D2), these just keep Redis from
// growing forever. Retries/backoff per sendify-infra.md §4.2's table — set
// here as each queue's defaultJobOptions (applies to every .add() call on
// that queue automatically) rather than repeated at every call site, which
// is exactly the kind of place a retry config gets silently forgotten
// otherwise. Found that gap directly: the first version of this file set no
// defaultJobOptions at all, so every job silently got BullMQ's default of
// zero retries — "5, exponential 10s" / "4, exponential 30s" from the plan
// were never actually in effect until this fix.
const RETENTION = { removeOnComplete: { age: 86400, count: 5000 }, removeOnFail: { age: 7 * 86400 } };
const ROUTE_JOB_OPTS = { attempts: 5, backoff: { type: "exponential", delay: 10_000 }, ...RETENTION };
const LINE_JOB_OPTS = { attempts: 4, backoff: { type: "exponential", delay: 30_000 }, ...RETENTION };
const INBOUND_JOB_OPTS = { attempts: 5, backoff: { type: "exponential", delay: 5_000 }, ...RETENTION };
// Lighter than INBOUND_JOB_OPTS on purpose — an LLM draft failing is
// low-stakes (worst case: no draft, a human replies manually), not worth
// INBOUND_JOB_OPTS's aggressive retry tuned for webhook reprocessing.
const DRAFT_REPLY_JOB_OPTS = { attempts: 2, backoff: { type: "exponential", delay: 10_000 }, ...RETENTION };

// BullMQ v5 rejects ":" in queue names (sendify-infra.md §4.2) — lineId is a
// Mongo ObjectId hex string, so this is already safe without any escaping.
const lineQueueName = (lineId) => `sendify-line-${lineId}`;

let maintenanceQueue = null;
function getMaintenanceQueue() {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, { ...DEFAULT_QUEUE_OPTS, defaultJobOptions: RETENTION });
  }
  return maintenanceQueue;
}

let routeQueue = null;
function getRouteQueue() {
  if (!routeQueue) {
    routeQueue = new Queue(QUEUE_NAMES.ROUTE, { ...DEFAULT_QUEUE_OPTS, defaultJobOptions: ROUTE_JOB_OPTS });
  }
  return routeQueue;
}

let inboundQueue = null;
function getInboundQueue() {
  if (!inboundQueue) {
    inboundQueue = new Queue(QUEUE_NAMES.INBOUND, { ...DEFAULT_QUEUE_OPTS, defaultJobOptions: INBOUND_JOB_OPTS });
  }
  return inboundQueue;
}

let draftReplyQueue = null;
function getDraftReplyQueue() {
  if (!draftReplyQueue) {
    draftReplyQueue = new Queue(QUEUE_NAMES.DRAFT_REPLY, { ...DEFAULT_QUEUE_OPTS, defaultJobOptions: DRAFT_REPLY_JOB_OPTS });
  }
  return draftReplyQueue;
}

const lineQueues = new Map(); // lineId (string) -> Queue instance
function getLineQueue(lineId) {
  const key = String(lineId);
  if (!lineQueues.has(key)) {
    lineQueues.set(key, new Queue(lineQueueName(key), { ...DEFAULT_QUEUE_OPTS, defaultJobOptions: LINE_JOB_OPTS }));
  }
  return lineQueues.get(key);
}

/** Closes every singleton queue's connection — called on worker/web SIGTERM. */
async function closeAllQueues() {
  if (maintenanceQueue) await maintenanceQueue.close();
  if (routeQueue) await routeQueue.close();
  if (inboundQueue) await inboundQueue.close();
  if (draftReplyQueue) await draftReplyQueue.close();
  for (const queue of lineQueues.values()) {
    await queue.close();
  }
  lineQueues.clear();
}

module.exports = {
  QUEUE_PREFIX,
  QUEUE_NAMES,
  DEFAULT_QUEUE_OPTS,
  lineQueueName,
  getMaintenanceQueue,
  getRouteQueue,
  getInboundQueue,
  getDraftReplyQueue,
  getLineQueue,
  closeAllQueues,
};
