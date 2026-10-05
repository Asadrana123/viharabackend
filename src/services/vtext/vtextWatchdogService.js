// services/vtext/vtextWatchdogService.js
//
// Tells the team on Slack when the queue machinery stops. Every other Vtext
// alert is raised BY the workers, so none of them can report that the workers
// have died, which is exactly what happened when the Redis plan ran out of
// commands. This runs in the web process and watches the same two signals the
// /health endpoint reads: whether Redis answers, and whether the maintenance
// worker's heartbeat key is still being refreshed.
//
// Quiet by design:
//   - it speaks on a CHANGE (healthy to broken, or broken to healthy)
//   - while something stays broken it repeats at most once per repeatMs
//   - it stays silent for graceMs after the process starts, because the workers
//     need a moment to write their first heartbeat
//   - the cost is two Redis commands per check
//
// It cannot notice the whole backend process dying. That needs an outside
// uptime monitor pointed at a public URL.
const { sendAlertWithCooldown } = require("./vtextAlertService");

const MINUTE = 60 * 1000;

/**
 * @param {object} deps
 * @param {() => Promise<boolean>} deps.ping - resolves true when Redis answers
 * @param {() => Promise<string|null>} deps.getHeartbeat - the worker heartbeat (an ISO time string) or null
 * @param {number} [deps.staleMs] - how old a heartbeat may be before the workers count as stopped (the worker writes one every 30 seconds)
 * @param {number} [deps.graceMs] - quiet period after start
 * @param {number} [deps.repeatMs] - minimum gap between repeats of the same alert
 * @param {() => number} [deps.clock]
 * @param {number} [deps.bootedAt]
 */
function createWatchdog({ ping, getHeartbeat, staleMs = 3 * MINUTE, graceMs = 3 * MINUTE, repeatMs = 30 * MINUTE, clock = () => Date.now(), bootedAt = clock() }) {
  let alertedStatus = null; // the broken status we last alerted about, or null when healthy or never alerted
  let problemSince = null;
  const lastSentAt = {}; // status -> clock() of our last send, so a per-minute check does not hit Mongo every time

  /** @returns {Promise<{status: "ok"|"redis-down"|"workers-stopped", detail?: string}>} */
  async function evaluate() {
    let heartbeat;
    try {
      if (!(await ping())) return { status: "redis-down", detail: "Redis did not answer a ping" };
      heartbeat = await getHeartbeat();
    } catch (err) {
      return { status: "redis-down", detail: err?.message || String(err) };
    }
    if (!heartbeat) return { status: "workers-stopped", detail: "No heartbeat has been recorded" };
    const ageMs = clock() - new Date(heartbeat).getTime();
    if (!(ageMs < staleMs)) {
      return { status: "workers-stopped", detail: `Last heartbeat ${Math.max(1, Math.round(ageMs / MINUTE))} minutes ago (${heartbeat})` };
    }
    return { status: "ok" };
  }

  async function checkOnce() {
    if (clock() - bootedAt < graceMs) return { status: "grace" };

    const result = await evaluate();

    if (result.status === "ok") {
      if (alertedStatus) {
        const downMinutes = Math.max(1, Math.round((clock() - problemSince) / MINUTE));
        await sendAlertWithCooldown("watchdog-recovered", MINUTE, {
          level: "info",
          title: "Workers and Redis recovered",
          fields: [{ label: "Was down for", value: `about ${downMinutes} minutes` }],
        }).catch((err) => console.error("[vtext watchdog] could not send recovery alert:", err.message));
        alertedStatus = null;
        problemSince = null;
      }
      return result;
    }

    if (!problemSince) problemSince = clock();
    const sentRecently = lastSentAt[result.status] && clock() - lastSentAt[result.status] < repeatMs;
    if (alertedStatus === result.status && sentRecently) return result; // already told them, not time to repeat

    lastSentAt[result.status] = clock();
    alertedStatus = result.status;
    const alert =
      result.status === "redis-down"
        ? {
            level: "error",
            title: "Redis unreachable",
            fields: [
              { label: "Problem", value: result.detail },
              { label: "Effect", value: "Texts cannot be queued or sent, and the workers are likely stopped as well" },
              { label: "Check", value: "The Redis provider (plan limit or outage) and the REDIS_URL setting" },
            ],
          }
        : {
            level: "error",
            title: "Workers stopped",
            fields: [
              { label: "Problem", value: result.detail },
              { label: "Effect", value: "Queued texts are not being sent, retried or processed, and line health checks have stopped" },
              { label: "Check", value: "The Render logs, then Redis" },
            ],
          };
    await sendAlertWithCooldown(`watchdog-${result.status}`, repeatMs, alert).catch((err) =>
      console.error("[vtext watchdog] could not send alert:", err.message)
    );
    return result;
  }

  return { checkOnce };
}

/** Starts the real watchdog in the web process. Returns a function that stops it. */
function startVtextWatchdog() {
  const { getRedisClient } = require("./queue/connection");
  const { HEARTBEAT_KEY } = require("./workers/maintenanceWorker");
  // Not connection.pingRedis(): that swallows the error and returns false, and the useful text
  // is exactly what Redis said ("ERR max requests limit exceeded...").
  const ping = async () => {
    const reply = await Promise.race([
      getRedisClient().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Redis ping timed out after 3 seconds")), 3000)),
    ]);
    return reply === "PONG";
  };
  const watchdog = createWatchdog({ ping, getHeartbeat: () => getRedisClient().get(HEARTBEAT_KEY) });
  const intervalMs = Number(process.env.VTEXT_WATCHDOG_INTERVAL_MS || MINUTE);

  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // a slow check must not stack up behind itself
    running = true;
    try {
      await watchdog.checkOnce();
    } catch (err) {
      console.error("[vtext watchdog] check failed:", err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.(); // never keep the process alive on its own
  console.log(`[vtext watchdog] started, checking every ${Math.round(intervalMs / 1000)}s`);
  return () => clearInterval(timer);
}

module.exports = { createWatchdog, startVtextWatchdog };
