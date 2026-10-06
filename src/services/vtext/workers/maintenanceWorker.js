// services/vtext/workers/maintenanceWorker.js
//
// Phase 0: a single named job, "noop-heartbeat", run as a BullMQ repeatable
// job scheduler every 30s. It just proves the worker process is alive by
// writing a timestamp to Redis — GET /api/v1/vtext/health reads that same
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
const VtextMessage = require("../../../model/vtext/vtextMessageModel");
const VtextContact = require("../../../model/vtext/vtextContactModel");
const VtextLine = require("../../../model/vtext/vtextLineModel");
const VtextLineUsage = require("../../../model/vtext/vtextLineUsageModel");
const VtextLineEvent = require("../../../model/vtext/vtextLineEventModel");
const { getAdapter, listAdapters } = require("../channels/registry");
const { evaluateAndMaybeQuarantine, statusBeforeOffline } = require("../vtextLineHealthService");
const { runFollowUpSweep } = require("../vtextFollowUpService");
const { sendAlertWithCooldown, getAlertWatermark, setAlertWatermark, isAlertingConfigured } = require("../vtextAlertService");
const { dayKey } = require("../vtextCapacityService");
const { notifyVtextAlert } = require("../../shared/slackService");
const { publishEvent } = require("../vtextEventsBus");

const HEARTBEAT_KEY = "vtext:worker:lastHeartbeatAt";

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
const STUCK_SENDING_MIN = Number(process.env.VTEXT_STUCK_SENDING_MIN || 10);
const STUCK_QUEUED_MIN = Number(process.env.VTEXT_STUCK_QUEUED_MIN || 2);
// An iMessage text that BlueBubbles accepted but never reported Sent/Delivered for did not get out
// (the Mac's Messages app shows "Not Delivered", usually a non-iMessage number). BlueBubbles sends no
// error for it, so without this the message stays "accepted" for good. The lookback keeps old history
// from flipping when this first runs.
const UNCONFIRMED_MIN = () => Number(process.env.VTEXT_UNCONFIRMED_MIN || 10);
const UNCONFIRMED_LOOKBACK_HOURS = () => Number(process.env.VTEXT_UNCONFIRMED_LOOKBACK_HOURS || 48);
const NO_RECEIPT_CODE = "no-receipt";

async function runUnconfirmedSendSweep() {
  const channelTypes = listAdapters().filter((a) => a.capabilities?.confirmsEveryDelivery).map((a) => a.type);
  if (!channelTypes.length) return 0;

  const now = Date.now();
  const candidates = await VtextMessage.find({
    direction: "out",
    status: "accepted",
    channelType: { $in: channelTypes },
    updatedAt: { $lt: new Date(now - UNCONFIRMED_MIN() * 60_000), $gt: new Date(now - UNCONFIRMED_LOOKBACK_HOURS() * 3_600_000) },
  }).select("_id conversationId").lean();

  let marked = 0;
  for (const c of candidates) {
    // The filter repeats the status, so a receipt that lands between the find and this write wins.
    const result = await VtextMessage.updateOne(
      { _id: c._id, status: "accepted" },
      {
        $set: {
          status: "unknown",
          failedAt: new Date(),
          error: { kind: "transient", code: NO_RECEIPT_CODE, message: `No delivery confirmation after ${UNCONFIRMED_MIN()} minutes` },
        },
        $push: { statusHistory: { status: "unknown", at: new Date(), detail: "no delivery receipt" } },
      }
    );
    if (result.modifiedCount) {
      marked += 1;
      publishEvent({ type: "message.updated", messageId: String(c._id), conversationId: c.conversationId ? String(c.conversationId) : null, status: "unknown" });
    }
  }
  if (marked > 0) console.warn(`[vtext stuck-sweep] ${marked} iMessage text(s) with no delivery receipt after ${UNCONFIRMED_MIN()}min -> marked "unknown"`);
  return marked;
}

async function runStuckMessageSweep() {
  const sendingCutoff = new Date(Date.now() - STUCK_SENDING_MIN * 60_000);
  const sendingResult = await VtextMessage.updateMany(
    { status: "sending", updatedAt: { $lt: sendingCutoff } },
    { $set: { status: "unknown" } }
  );
  if (sendingResult.modifiedCount > 0) {
    console.warn(`[vtext stuck-sweep] ${sendingResult.modifiedCount} message(s) stuck "sending" > ${STUCK_SENDING_MIN}min -> marked "unknown"`);
  }

  const queuedCutoff = new Date(Date.now() - STUCK_QUEUED_MIN * 60_000);
  const stuckQueued = await VtextMessage.find({
    status: { $in: ["queued", "assigned", "waiting-capacity", "waiting-window"] },
    updatedAt: { $lt: queuedCutoff },
  });
  const routeQueue = getRouteQueue();
  for (const message of stuckQueued) {
    await routeQueue.add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-sweep-${Date.now()}` });
  }
  if (stuckQueued.length > 0) {
    console.warn(`[vtext stuck-sweep] re-enqueued ${stuckQueued.length} message(s) stuck pre-send > ${STUCK_QUEUED_MIN}min`);
  }

  await runUnconfirmedSendSweep();
}

// §4.6/§7.4: heartbeat-staleness -> offline, and restoration when healthy
// again. A line going offline is NOT the same as quarantine (§7.4) — offline
// is "can't currently reach the device," reversible automatically; quarantine
// is "this line is misbehaving," reversible only by an admin.
const HEARTBEAT_STALE_MIN = Number(process.env.VTEXT_HEARTBEAT_STALE_MIN || 15);

async function runLineHealthSweep() {
  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MIN * 60_000);

  // Going offline: warming/active lines with a stale (or missing) heartbeat,
  // confirmed by a failing healthCheck() (not heartbeat staleness alone —
  // the heartbeat event itself might just not be wired up on a given
  // channel yet, which shouldn't by itself take a line offline).
  // +credentials is required here, not optional — every real adapter's
  // healthCheck() needs them to actually reach the provider. Missing this
  // was a real bug, found during the first real-device test: healthCheck()
  // threw ("no stored credentials — was it loaded with +credentials
  // selected?") on every single call, which the catch block below silently
  // turned into `healthy = false` — so a perfectly healthy line with no
  // heartbeat-webhook mechanism (BlueBubbles has none at all; its only
  // webhook events are new-message/updated-message) got auto-flipped
  // offline on its very first health sweep, every time, regardless of
  // actual health.
  const candidates = await VtextLine.find({ status: { $in: ["warming", "active"] } })
    .select("+credentials.iv +credentials.tag +credentials.ciphertext");
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
    if (healthy) {
      // Channels with no heartbeat event (BlueBubbles) never get a lastHeartbeatAt,
      // so a passing health check is recorded as one. That makes "Last heartbeat"
      // in the admin UI meaningful and lets an offline line come back on its own.
      if (!adapter.capabilities?.heartbeat) {
        line.health = line.health || {};
        line.health.lastHeartbeatAt = new Date();
        await line.save();
      }
      continue;
    }

    const fromStatus = line.status;
    line.status = "offline";
    line.statusReason = `heartbeat stale > ${HEARTBEAT_STALE_MIN}min and healthCheck failed`;
    line.statusChangedAt = new Date();
    line.statusChangedBy = { kind: "system" };
    await line.save();
    await VtextLineEvent.create({ lineId: line._id, type: "heartbeat-lost", from: fromStatus, to: "offline", reason: line.statusReason, actor: { kind: "system" } });
    publishEvent({ type: "line.updated", lineId: String(line._id), status: "offline" });
    notifyVtextAlert({ level: "warning", title: "Line offline", fields: [{ label: "Line", value: line.name }] }).catch(() => {});
  }

  // Restoration: an offline line whose heartbeat is fresh again goes back to
  // whatever status it was in right before going offline (read from its own
  // most recent heartbeat-lost event, rather than a new schema field).
  const offlineLines = await VtextLine.find({ status: "offline" })
    .select("+credentials.iv +credentials.tag +credentials.ciphertext");
  for (const line of offlineLines) {
    let fresh = line.health?.lastHeartbeatAt && new Date(line.health.lastHeartbeatAt) >= staleCutoff;
    let restoredBy = "heartbeat restored";

    // A line whose channel has no heartbeat can never prove it is back through one.
    // Before this, a BlueBubbles line that went offline (say the Mac lost its
    // network for an hour) stayed offline forever. Use the health check instead.
    if (!fresh && !getAdapter(line.channelType).capabilities?.heartbeat) {
      let healthy = false;
      try {
        healthy = !!(await getAdapter(line.channelType).healthCheck({ line }))?.ok;
      } catch {
        healthy = false;
      }
      if (healthy) {
        line.health = line.health || {};
        line.health.lastHeartbeatAt = new Date();
        fresh = true;
        restoredBy = "health check passing again";
      }
    }
    if (!fresh) continue;

    const restoreTo = await statusBeforeOffline(line._id);

    line.status = restoreTo;
    line.statusReason = restoredBy;
    line.statusChangedAt = new Date();
    line.statusChangedBy = { kind: "system" };
    await line.save();
    await VtextLineEvent.create({ lineId: line._id, type: "heartbeat-restored", from: "offline", to: restoreTo, actor: { kind: "system" } });
    publishEvent({ type: "line.updated", lineId: String(line._id), status: restoreTo });
    notifyVtextAlert({ level: "info", title: "Line restored", fields: [{ label: "Line", value: line.name }] }).catch(() => {});
  }

  // Failure-rate quarantine check — consecutiveFailures is evaluated live in
  // lineSendWorker on every failure; this catches the failureRateRecent
  // trigger, which needs a query over recent history rather than a counter.
  const routableLines = await VtextLine.find({ status: { $in: ["warming", "active"] } });
  for (const line of routableLines) {
    await evaluateAndMaybeQuarantine(line);
  }
}

// §4.6/§7.6: rolls up the last 7 days of vtextLineUsage into
// line.health.replyRatio7d/sentLast7d (the §7.4 soft-throttle inputs), and
// advances warming -> active once a line's warm-up schedule has run its course.
async function runDailyRollover() {
  const lines = await VtextLine.find({ status: { $ne: "retired" } });
  const sevenDaysAgo = dayKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  for (const line of lines) {
    const usageRows = await VtextLineUsage.find({ lineId: line._id, day: { $gte: sevenDaysAgo } });
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
        await VtextLineEvent.create({ lineId: line._id, type: "warmup-advanced", from: "warming", to: "active", actor: { kind: "system" } });
      }
    }

    await line.save();
  }
}

const BACKLOG_ALERT_THRESHOLD = Number(process.env.VTEXT_BACKLOG_ALERT || 200);
// This job runs every 5 minutes, and a backlog can last for hours. Without a cooldown the
// same alert posted every 5 minutes for as long as the backlog stood.
const BACKLOG_ALERT_COOLDOWN_MS = Number(process.env.VTEXT_BACKLOG_ALERT_COOLDOWN_MIN || 120) * 60_000;

async function runBacklogAlert() {
  const count = await VtextMessage.countDocuments({ status: "waiting-capacity" });
  if (count > BACKLOG_ALERT_THRESHOLD) {
    await sendAlertWithCooldown("backlog", BACKLOG_ALERT_COOLDOWN_MS, {
      level: "warning",
      title: "Outbound backlog over threshold",
      fields: [{ label: "Messages waiting on capacity", value: count }, { label: "Threshold", value: BACKLOG_ALERT_THRESHOLD }],
    }).catch((err) => console.error("[vtext backlog-alert] could not send:", err.message));
  }
}

// One Slack message summarising the texts that failed since the last one, instead of one per
// failure. Individual failures were silent before: they only showed in the admin's Failed tab.
// Recipient failures (not on iMessage, bad number) are expected and reported as such; any
// other kind (line, config, transient) is what the team needs to look at.
const FAILED_DIGEST_KEY = "failedDigestAt";
const FAILED_DIGEST_MAX_LOOKBACK_MS = 6 * 60 * 60_000; // never report further back than this, after a long Slack outage
const failedDigestIntervalMs = () => Number(process.env.VTEXT_FAILED_DIGEST_INTERVAL_MS || 15 * 60_000);

async function runFailedSendDigest() {
  const runStartedAt = new Date();

  // With Slack off there is nobody to tell. Keep the watermark current anyway, so that switching
  // alerts on later does not announce hours of old failures at once.
  if (!isAlertingConfigured()) {
    await setAlertWatermark(FAILED_DIGEST_KEY, runStartedAt);
    return;
  }

  const watermark = await getAlertWatermark(FAILED_DIGEST_KEY);
  const since = new Date(Math.max(
    runStartedAt.getTime() - FAILED_DIGEST_MAX_LOOKBACK_MS,
    (watermark || new Date(runStartedAt.getTime() - failedDigestIntervalMs())).getTime()
  ));

  const window = { $gt: since, $lte: runStartedAt };
  const failed = await VtextMessage.find({
    direction: "out",
    // "unknown" with no-receipt is a text BlueBubbles accepted that never got out (see runUnconfirmedSendSweep)
    $and: [
      { $or: [{ status: "failed" }, { status: "unknown", "error.code": NO_RECEIPT_CODE }] },
      // every path that fails a message sets failedAt; updatedAt covers a path that ever forgets
      { $or: [{ failedAt: window }, { failedAt: { $exists: false }, updatedAt: window }] },
    ],
  })
    .select("contactId error")
    .lean();

  if (!failed.length) {
    await setAlertWatermark(FAILED_DIGEST_KEY, runStartedAt);
    return;
  }

  const kindOf = (m) => (m.error?.code === NO_RECEIPT_CODE ? "no delivery confirmation" : m.error?.kind || "unknown");
  const expected = failed.filter((m) => kindOf(m) === "recipient").length;
  const attention = failed.length - expected;
  const breakdown = {};
  for (const m of failed) if (kindOf(m) !== "recipient") breakdown[kindOf(m)] = (breakdown[kindOf(m)] || 0) + 1;

  // up to five examples, the ones that need attention first, numbers masked to the last four digits
  const examples = [...failed.filter((m) => kindOf(m) !== "recipient"), ...failed.filter((m) => kindOf(m) === "recipient")].slice(0, 5);
  const contacts = await VtextContact.find({ _id: { $in: examples.map((m) => m.contactId) } }).select("phoneE164").lean();
  const phoneById = new Map(contacts.map((c) => [String(c._id), c.phoneE164]));
  const exampleLines = examples.map((m) => {
    const phone = String(phoneById.get(String(m.contactId)) || "");
    // "…0404", not "***0404": Slack reads asterisks as bold markup and would mangle the list
    const who = phone ? `…${phone.slice(-4)}` : "unknown contact";
    return `${who} (${kindOf(m)}): ${String(m.error?.message || "no reason recorded").slice(0, 80)}`;
  });

  const minutes = Math.max(1, Math.round((runStartedAt.getTime() - since.getTime()) / 60_000));
  const fields = [{ label: "Failed", value: `${failed.length} in the last ${minutes} minutes` }];
  if (expected) fields.push({ label: "Not deliverable (expected)", value: `${expected}: not on iMessage, or a bad number` });
  if (attention) {
    fields.push({ label: "Need attention", value: `${attention} (${Object.entries(breakdown).map(([k, n]) => `${k} ${n}`).join(", ")})` });
  }
  fields.push({ label: "Examples", value: exampleLines.join("\n") });

  const posted = await notifyVtextAlert({
    level: attention ? "warning" : "info",
    title: `${failed.length} text${failed.length === 1 ? "" : "s"} failed`,
    fields,
  });
  if (posted) {
    await setAlertWatermark(FAILED_DIGEST_KEY, runStartedAt);
  } else {
    console.error("[vtext failed-digest] Slack post did not go through; these failures will be included in the next digest");
  }
}

const JOB_HANDLERS = {
  "noop-heartbeat": runNoopHeartbeat,
  "stuck-message-sweep": runStuckMessageSweep,
  "line-health-sweep": runLineHealthSweep,
  "daily-rollover": runDailyRollover,
  "backlog-alert": runBacklogAlert,
  "followup-sweep": runFollowUpSweep,
  "failed-send-digest": runFailedSendDigest,
};

async function processMaintenanceJob(job) {
  const handler = JOB_HANDLERS[job.name];
  if (!handler) {
    throw new Error(`[vtext maintenance] no handler for job "${job.name}"`);
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
  // These were originally run far faster than the plan's stated cadence on
  // the assumption that a no-op tick (nothing actually stuck/unhealthy) is
  // free. It isn't: BullMQ does real Redis bookkeeping on every scheduled
  // tick regardless of whether the job's own logic finds anything to do
  // (scheduling the next run, lock acquire/release, marking active then
  // completed). At 60s/60s/5min across three jobs that added up fast enough
  // to burn through a big chunk of Upstash's free monthly command quota in
  // under a day. Defaults now match the plan's intended production cadence;
  // set the env var below to something faster ONLY for local dev/testing
  // responsiveness, never leave it unset-fast in a deployed environment.
  await queue.upsertJobScheduler(
    "stuck-message-sweep",
    { every: Number(process.env.VTEXT_STUCK_MESSAGE_SWEEP_INTERVAL_MS || 10 * 60_000) },
    { name: "stuck-message-sweep" },
  );
  await queue.upsertJobScheduler(
    "line-health-sweep",
    { every: Number(process.env.VTEXT_LINE_HEALTH_SWEEP_INTERVAL_MS || 15 * 60_000) },
    { name: "line-health-sweep" },
  );
  await queue.upsertJobScheduler(
    "daily-rollover",
    { every: Number(process.env.VTEXT_DAILY_ROLLOVER_INTERVAL_MS || 24 * 60 * 60_000) },
    { name: "daily-rollover" },
  );
  await queue.upsertJobScheduler(
    "backlog-alert",
    { every: Number(process.env.VTEXT_BACKLOG_ALERT_INTERVAL_MS || 5 * 60_000) },
    { name: "backlog-alert" },
  );
  // One Redis tick per 15 min is cheap; the sweep itself is a single indexed Mongo query when nothing is due.
  await queue.upsertJobScheduler(
    "followup-sweep",
    { every: Number(process.env.VTEXT_FOLLOWUP_SWEEP_INTERVAL_MS || 15 * 60_000) },
    { name: "followup-sweep" },
  );
  await queue.upsertJobScheduler(
    "failed-send-digest",
    { every: failedDigestIntervalMs() },
    { name: "failed-send-digest" },
  );
}

let worker = null;

function startMaintenanceWorker() {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAMES.MAINTENANCE, processMaintenanceJob, {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 1,
    // BullMQ's 30s default stalled-check runs continuously regardless of
    // traffic — a real, measured contributor to Upstash command usage.
    stalledInterval: 90_000,
  });
  worker.on("failed", (job, err) => {
    console.error(`[vtext maintenance] job "${job?.name}" failed:`, err.message);
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
  runLineHealthSweep,
  runBacklogAlert,
  runFailedSendDigest,
  runUnconfirmedSendSweep,
  ensureMaintenanceSchedulers,
  startMaintenanceWorker,
  stopMaintenanceWorker,
};
