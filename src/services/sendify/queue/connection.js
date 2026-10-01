// services/sendify/queue/connection.js
//
// BullMQ needs its own ioredis connection options (maxRetriesPerRequest: null
// is required by BullMQ's blocking commands — without it, a Worker's blocking
// XREAD-style calls can time out and throw instead of waiting). Queue/Worker/
// QueueEvents each get their own connection internally when given these
// options rather than a shared client, which is the pattern BullMQ's own docs
// recommend and what the sibling google-hackathon-aivideogen project's
// apps/workers/src/index.ts bootstrap follows.
const Redis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Connection options object — pass this, not a shared client, to each Queue/Worker. */
function redisConnectionOptions() {
  return {
    maxRetriesPerRequest: null,
  };
}

/**
 * A standalone ioredis client for non-BullMQ uses (pub/sub for sendify:events,
 * the new-recipient-per-hour ZSET, the worker heartbeat key). Safe to share
 * across call sites within one process — ioredis pipelines commands.
 *
 * ioredis's default is to buffer commands indefinitely while disconnected
 * (enableOfflineQueue:true), so a .ping() against a dead Redis would
 * otherwise hang forever instead of failing. Tried fixing that with
 * enableOfflineQueue:false, but that broke the ordinary "client just
 * constructed, connection still in flight" case too — a command issued
 * before the first "ready" event throws immediately ("Stream isn't
 * writeable"), which is wrong on every cold start, not just a real outage.
 * The actual fix is simpler: leave offline queueing on (so normal
 * reconnects/cold-starts work), and let pingRedis()'s own Promise.race
 * below be the single source of "give up after 3s" — that's what makes a
 * genuinely-dead Redis fail fast without punishing a healthy one that just
 * hasn't finished its handshake yet. Found this by testing the down-Redis
 * case directly (not just via the auth-gated HTTP route) during Phase 0.
 */
let sharedClient = null;
function getRedisClient() {
  if (!sharedClient) {
    sharedClient = new Redis(REDIS_URL, {
      ...redisConnectionOptions(),
      connectTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    sharedClient.on("error", (err) => {
      console.error("[sendify] Redis client error:", err.message);
    });
  }
  return sharedClient;
}

/** A fresh client for BullMQ's Queue/Worker/QueueEvents constructors (connection: {...}). */
function bullmqConnection() {
  return { url: REDIS_URL, ...redisConnectionOptions() };
}

async function pingRedis() {
  try {
    // Belt-and-suspenders timeout on top of the client's own connectTimeout —
    // a command issued mid-reconnect can still outlive that window.
    const result = await Promise.race([
      getRedisClient().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 3000)),
    ]);
    return result === "PONG";
  } catch {
    return false;
  }
}

module.exports = { REDIS_URL, getRedisClient, bullmqConnection, pingRedis };
