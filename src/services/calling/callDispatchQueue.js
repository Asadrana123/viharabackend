// services/callDispatchQueue.js
//
// One shared, account-wide limiter that ALL call schedulers push their bursts
// through, so the combined outbound volume respects a SINGLE VAPI concurrency
// ceiling — not three independent caps that add up.
//
// Why this exists:
//   Each scheduler's daily 1:32 PM sweep used to fire every due lead's burst at
//   the same instant (fire-and-forget). With the early-access, Georgia St and
//   Rensselaer schedulers all sharing the same 1:32 PM time, a timezone landing
//   at 1:32 could launch dozens of simultaneous calls and blow past VAPI's
//   concurrency limit (10 by default). Nothing paced them.
//
// What this does:
//   • Concurrency cap — never more than MAX_CONCURRENT_BURSTS bursts in flight.
//     A slot frees the moment a burst resolves, and the next waiting burst runs.
//   • Stagger — a minimum gap between starting one burst and the next, so even
//     the first few don't hit VAPI on the same tick.
//   • Priority — two lanes. Signup bursts (a lead who registered seconds ago,
//     owed a call "within 60 seconds") always jump ahead of scheduled retries
//     (a routine daily callback that no one notices if it's a minute late).
//     When a slot frees, the signup lane is drained before the scheduled lane.
//
// Nothing is ever dropped. The queue drains fully; it only paces the drain.
// Priority means "next in line when a slot frees," not "interrupt a live call."
//
// Sizing (VAPI limit = 10): runCallBurst is SEQUENTIAL — it dials the second
// number only after the first ends — so a burst holds at most ONE live call at
// any instant. A cap of 6 bursts therefore peaks at ~6 live calls, a safe buffer
// under the ceiling while still draining a 1:32 PM batch quickly. Both values are
// env-tunable so they can change without a redeploy.

const { runCallBurst } = require("./registrationCallService");
const MatchCallCampaign = require("../../model/calling/matchCallCampaignModel");
const { normalisePhone } = require("./vapiCallsService");

/**
 * Buyer Match takeover: while an admin-started call schedule is active for a
 * number, the routine sign-up follow-up calls to that number are skipped (the
 * scheduler just moves on to its next slot). Signup calls, callbacks the person
 * asked for, and the Buyer Match calls themselves are never skipped.
 */
async function isTakenOverByBuyerMatch(payload) {
  if (!payload || !payload.isFollowUp) return false;
  const phone = normalisePhone(payload.phone);
  if (!phone) return false;
  try {
    return !!(await MatchCallCampaign.exists({ phone, status: "active" }));
  } catch (_e) {
    return false; // never block calling on a lookup failure
  }
}

// At most this many bursts run at once. Each burst = at most 1 live call, so this
// is effectively the peak live-call count. 6 leaves headroom under a limit of 10.
const MAX_CONCURRENT_BURSTS = Math.max(
  1,
  parseInt(process.env.VAPI_MAX_CONCURRENT_BURSTS, 10) || 8
);

// Minimum gap between two burst STARTS, so a batch doesn't detonate on one tick.
const STAGGER_MS = Math.max(
  0,
  parseInt(process.env.VAPI_BURST_STAGGER_MS, 10) || 1500
);

// Lane tags a scheduler passes when handing off a burst.
const PRIORITY = {
  SIGNUP: "signup",       // just registered — time-critical, always wins
  SCHEDULED: "scheduled", // daily 1:32 PM retry — routine, can wait
};

const highLane = [];   // signup bursts
const normalLane = []; // scheduled bursts

let active = 0;        // bursts currently in flight
let lastStartAt = 0;   // ms timestamp of the last burst we started
let pumpTimer = null;  // pending "start the next burst" timer, if any

/**
 * Hand a burst to the shared queue instead of dialing directly. Resolves/rejects
 * with exactly what runCallBurst returns (e.g. { connected }), so callers keep
 * their existing .then/.catch and await usage unchanged.
 *
 * @param {object} payload           the callPayload the scheduler built
 * @param {object} [opts]            burst options (initialDelayMs, noPickupReasons, …)
 * @param {string} [priority]        PRIORITY.SIGNUP | PRIORITY.SCHEDULED (default scheduled)
 * @returns {Promise<any>}           runCallBurst's resolved value
 */
async function enqueueBurst(payload, opts = {}, priority = PRIORITY.SCHEDULED) {
  if (await isTakenOverByBuyerMatch(payload)) {
    console.log(`[dispatch] follow-up to ${payload.phone} skipped — Buyer Match calls are running for this number`);
    return { connected: false, suppressed: true };
  }
  return enqueueJob(() => runCallBurst(payload, opts), priority);
}

/**
 * Queue any calling work (not just a burst) behind the same concurrency cap and
 * stagger. `run` must place at most ONE live call at a time and return a promise.
 * Used by Buyer Match calls, which dial once per slot instead of a 2-call burst.
 */
function enqueueJob(run, priority = PRIORITY.SCHEDULED) {
  return new Promise((resolve, reject) => {
    const job = { run, resolve, reject };
    if (priority === PRIORITY.SIGNUP) highLane.push(job);
    else normalLane.push(job);
    pump();
  });
}

/** Pull the next job — signup lane first, then scheduled. */
function nextJob() {
  return highLane.shift() || normalLane.shift() || null;
}

/**
 * Start as many bursts as the cap and stagger allow. Called whenever a job is
 * enqueued or an in-flight burst finishes. Self-schedules via pumpTimer to honour
 * the stagger; only ever one timer is pending at a time.
 */
function pump() {
  if (highLane.length === 0 && normalLane.length === 0) return; // nothing waiting
  if (active >= MAX_CONCURRENT_BURSTS) return;                  // no free slot
  if (pumpTimer) return;                                        // a start is already scheduled

  const wait = Math.max(0, STAGGER_MS - (Date.now() - lastStartAt));
  if (wait > 0) {
    pumpTimer = setTimeout(() => {
      pumpTimer = null;
      pump();
    }, wait);
    return;
  }

  const job = nextJob();
  if (!job) return;

  active += 1;
  lastStartAt = Date.now();

  Promise.resolve()
    .then(job.run)
    .then(job.resolve, job.reject)
    .finally(() => {
      active -= 1;
      pump(); // a slot just freed — try the next one
    });

  // Try to line up the following burst (the stagger timer will space it out).
  pump();
}

module.exports = {
  enqueueBurst,
  enqueueJob,
  PRIORITY,
  MAX_CONCURRENT_BURSTS,
  STAGGER_MS,
};
