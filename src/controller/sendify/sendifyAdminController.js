// controller/sendify/sendifyAdminController.js
const catchAsyncError = require("../../middleware/catchAsyncError");

const SENDIFY_ENABLED = process.env.SENDIFY_ENABLED === "true";
// Heartbeat older than this is treated as "worker not running" (Phase 0's
// noop-heartbeat scheduler writes every 30s — 90s gives it two misses of
// slack before flagging stale).
const HEARTBEAT_STALE_MS = 90_000;

/**
 * GET /api/v1/sendify/health
 *
 * D6: when SENDIFY_ENABLED is false (the default), this returns 503 and never
 * touches Redis at all — Sendify stays fully inert until explicitly turned on.
 */
const health = catchAsyncError(async (req, res) => {
  if (!SENDIFY_ENABLED) {
    return res.status(503).json({ success: false, enabled: false, message: "Sendify is disabled (SENDIFY_ENABLED is not 'true')" });
  }

  // Required lazily, only once we know Redis is actually wanted.
  const { pingRedis, getRedisClient } = require("../../services/sendify/queue/connection");
  const { getMaintenanceQueue } = require("../../services/sendify/queue/queues");
  const { HEARTBEAT_KEY } = require("../../services/sendify/workers/maintenanceWorker");

  const redisOk = await pingRedis();

  let lastHeartbeatAt = null;
  let workerHeartbeatOk = false;
  if (redisOk) {
    lastHeartbeatAt = await getRedisClient().get(HEARTBEAT_KEY);
    if (lastHeartbeatAt) {
      workerHeartbeatOk = Date.now() - new Date(lastHeartbeatAt).getTime() < HEARTBEAT_STALE_MS;
    }
  }

  let queueCounts = null;
  if (redisOk) {
    try {
      queueCounts = await getMaintenanceQueue().getJobCounts();
    } catch {
      queueCounts = null; // Redis flaked between the ping and this call — not fatal to the health response.
    }
  }

  return res.status(redisOk ? 200 : 503).json({
    success: redisOk,
    enabled: true,
    redis: { ok: redisOk },
    worker: { heartbeatOk: workerHeartbeatOk, lastHeartbeatAt },
    queues: { maintenance: queueCounts },
    channels: { enabled: ["imessage-bluebubbles", "mock"] }, // hardcoded until the channel registry exists (Phase 1)
  });
});

module.exports = { health };
