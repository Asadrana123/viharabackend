// services/voiceCallbackScheduler.js
//
// Dials human-requested callbacks when they come due. A per-minute cron sweep
// (same shape as the lead schedulers) picks up every pending CallbackRequest
// whose nextCallAt has passed, claims it atomically, and hands the burst to the
// shared callDispatchQueue so callbacks respect the same account-wide VAPI
// concurrency cap as everything else.
//
// First dial happens at the exact time the caller asked for. If no one picks
// up, applyOutcome() reschedules it into the daily 1:32 PM retry loop.

const cron = require("node-cron");
const CallbackRequest = require("../model/callbackRequestModel");
const { DID_NOT_CONNECT_REASONS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const {
  buildBurstPayload,
  applyOutcome,
  nextDailyCallAt,
} = require("./voiceCallbackService");

const SWEEP_BATCH = 200; // max callbacks evaluated per minute

// Broad no-pickup set + treat errors as no-pickup, so the loop only stops on a
// real human pickup — identical to the lead schedulers.
const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
};

let sweeping = false; // prevent overlapping sweeps

async function sweepDueCallbacks() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();
    const due = await CallbackRequest.find({
      status: "pending",
      nextCallAt: { $ne: null, $lte: now },
    })
      .sort({ nextCallAt: 1 })
      .limit(SWEEP_BATCH)
      .lean();

    if (due.length === 0) return;

    const dialedNumbers = new Set(); // per-sweep same-number dedup

    for (const cb of due) {
      const num = cb.phone || "";

      // Same-number dedup: only the first request on a number fires this sweep;
      // push the rest to the next daily slot so they don't pile up at once.
      if (num && dialedNumbers.has(num)) {
        await CallbackRequest.updateOne(
          { _id: cb._id, status: "pending" },
          { $set: { nextCallAt: nextDailyCallAt(cb.timezone) } }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim: move nextCallAt forward + stamp lastCallAt so an
      // overlapping tick (or a long-running burst) can't re-dial it now.
      const claimed = await CallbackRequest.findOneAndUpdate(
        { _id: cb._id, status: "pending", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextDailyCallAt(cb.timezone), lastCallAt: now },
          $inc: { attempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      // Hand the burst to the shared queue. Signup lane — a caller who asked to
      // be rung back at a set time is time-critical, so it jumps ahead of the
      // routine daily lead retries rather than queuing behind them.
      enqueueBurst(buildBurstPayload(claimed), BURST_OPTS, PRIORITY.SIGNUP)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[callback] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[callback] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute callback sweep. Call once, after the server boots. */
function startVoiceCallbackScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCallbacks); // every minute
  console.log("[callback] scheduler started — dialing human-requested callbacks (per-minute sweep).");
  return task;
}

module.exports = {
  startVoiceCallbackScheduler,
  sweepDueCallbacks,
};
