// Keeps this worker's claim on a run alive with periodic heartbeats, and
// aborts the agent if the admin cancels or the lock is lost.
import { api, ApiError } from "./api.js";
import { config } from "./config.js";

export function startLease(runId, { getCostUsd, timeLimitMs, log }) {
  const abortController = new AbortController();
  let stopReason = null;

  const stop = (reason) => {
    if (stopReason) return;
    stopReason = reason;
    abortController.abort(reason);
  };

  const beat = async () => {
    try {
      const res = await api.heartbeat(runId, getCostUsd());
      if (res.stop) stop(`run is now "${res.status}"`);
    } catch (err) {
      // 4xx means the run or lock is gone; network blips just retry next beat.
      if (err instanceof ApiError && err.status < 500) stop(`heartbeat rejected: ${err.message}`);
      else log(`heartbeat failed (will retry): ${err.message}`);
    }
  };

  const interval = setInterval(beat, config.heartbeatSeconds * 1000);
  const timer = setTimeout(() => stop("time limit reached"), timeLimitMs);

  return {
    signal: abortController.signal,
    abortController,
    get stopReason() {
      return stopReason;
    },
    release() {
      clearInterval(interval);
      clearTimeout(timer);
    },
  };
}
