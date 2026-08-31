// services/norCalCallScheduler.js
//
// Northern California early-access call flow with a daily callback loop:
//
//   Signup (with consent):
//     → 2-in-60s burst
//         • picked up  → callStatus="connected", loop STOPS
//         • no pickup  → callStatus="no-answer", nextCallAt = next daily slot
//
//   3x/day at 11:00 AM, 2:30 PM, 6:00 PM in the lead's timezone (1-minute sweep):
//     → 2-in-60s burst again
//         • picked up  → "connected", STOP forever
//         • no pickup  → reschedule for the next slot (or 11:00 AM tomorrow)
//
// "Never stop until pickup" — the loop only ends on a genuine pickup. State is
// stored on the lead (nextCallAt + callStatus), so it survives Render restarts.
//
// Same-number guard: at most ONE call per normalized phone per daily sweep, so
// two people who registered with the same number aren't both dialed.
//
// CONCURRENCY: bursts are handed to the shared callDispatchQueue, which caps how
// many run at once (account-wide) and staggers their starts. Signup bursts use
// the high-priority lane so a fresh lead is never stuck behind routine retries.

const cron = require("node-cron");
const { DateTime } = require("luxon");
const NorCalLead = require("../model/norCalLeadModel");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const norCalVoicePrompt = require("../config/norCalVoicePrompt");

// Three daily follow-up slots in the lead's local timezone (24h clock).
// A no-answer rolls the lead to the NEXT slot; after the last slot of the day it
// rolls to the first slot tomorrow. Keep this list sorted ascending.
const CALL_SLOTS = [
  { hour: 11, minute: 0 },  // 11:00 AM
  { hour: 14, minute: 30 }, // 2:30 PM
  { hour: 18, minute: 0 },  // 6:00 PM
];
// Market-appropriate fallback when a lead has no/invalid tz (this is a NorCal funnel).
const DEFAULT_TZ = "America/Los_Angeles";
const SWEEP_BATCH = 200; // max leads evaluated per minute

// Burst options: broad no-pickup set + treat errors as no-pickup, so the loop
// only stops on a real human pickup.
const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
};

/**
 * Next daily call slot in the lead's timezone, as a UTC Date.
 * Returns the earliest of today's slots still ahead of "now"; if all of today's
 * slots have already passed, returns the first slot tomorrow. DST-correct.
 */
function nextDailyCallAt(timezone) {
  const zone = timezone || DEFAULT_TZ;
  let now = DateTime.now().setZone(zone);
  if (!now.isValid) now = DateTime.now().setZone(DEFAULT_TZ);

  for (const slot of CALL_SLOTS) {
    const target = now.set({ hour: slot.hour, minute: slot.minute, second: 0, millisecond: 0 });
    if (target > now) return target.toUTC().toJSDate();
  }

  // Every slot today has passed → first slot tomorrow.
  const first = CALL_SLOTS[0];
  const tomorrow = now
    .plus({ days: 1 })
    .set({ hour: first.hour, minute: first.minute, second: 0, millisecond: 0 });
  return tomorrow.toUTC().toJSDate();
}

/**
 * Payload the dispatcher expects (canonical phone + prompt vars).
 * `promptConfig` pins the NorCal prompt for every dial; `source` tags it.
 * `market` maps to {{prospect_markets}} (always "Northern California" here).
 */
function callPayload(lead) {
  return {
    leadId: lead._id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone, // dial the canonical E.164 form
    market: lead.market || "Northern California",
    buyerType: lead.buyerType,
    promptConfig: norCalVoicePrompt, // { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
    source: "nor-cal",
  };
}

/**
 * Persist a burst outcome.
 *   connected → stop this lead (and any sibling leads on the same number).
 *   no pickup → schedule the next daily slot.
 */
async function applyOutcome(lead, connected) {
  if (connected) {
    await NorCalLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "connected", nextCallAt: null } }
    );
    // The number answered — stop other pending loops on the same number.
    if (lead.phoneNormalized) {
      await NorCalLead.updateMany(
        { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await NorCalLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "no-answer", nextCallAt: nextDailyCallAt(lead.timezone) } }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a lead registers
 * with consent. Runs the burst (WAIT_MS initial wait to honour the "we call you
 * within 60 seconds" promise), then stops or schedules the first daily callback.
 *
 * @param {object} lead { leadId, fullName, email, phone, phoneNormalized, timezone, market, buyerType }
 */
async function scheduleNorCalSignupCall(lead = {}) {
  if (!lead || !lead.leadId) return;

  await NorCalLead.updateOne(
    { _id: lead.leadId },
    { $set: { lastCallAt: new Date() }, $inc: { callAttempts: 1 } }
  );

  const { connected } = await enqueueBurst(
    callPayload({ _id: lead.leadId, ...lead }),
    { initialDelayMs: WAIT_MS, ...BURST_OPTS },
    PRIORITY.SIGNUP
  );

  await applyOutcome(
    { _id: lead.leadId, phoneNormalized: lead.phoneNormalized, timezone: lead.timezone },
    connected
  );
}

// ─── Daily sweep ──────────────────────────────────────────────────────────────

let sweeping = false; // prevent overlapping sweeps

async function sweepDueCalls() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();
    const due = await NorCalLead.find({
      callStatus: "no-answer",
      nextCallAt: { $ne: null, $lte: now },
      callingStopped: { $ne: true }, // admin "stop calling" kill-switch — skip these leads
    })
      .sort({ nextCallAt: 1 })
      .limit(SWEEP_BATCH)
      .lean();

    if (due.length === 0) return;

    const dialedNumbers = new Set(); // per-sweep same-number dedup

    for (const lead of due) {
      const num = lead.phoneNormalized || "";

      // Same-number dedup: only the first lead on a number fires this sweep;
      // push the rest to the next slot so they don't pile up today.
      if (num && dialedNumbers.has(num)) {
        await NorCalLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: { nextCallAt: nextDailyCallAt(lead.timezone) } }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim: move nextCallAt to the next slot + stamp lastCallAt so an
      // overlapping tick (or a long-running burst) can't re-dial the lead today.
      const claimed = await NorCalLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextDailyCallAt(lead.timezone), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      // Hand the burst to the shared queue (scheduled lane — paced behind any
      // signup bursts, no initial delay since it's already a call slot in their time).
      enqueueBurst({ ...callPayload(claimed), isFollowUp: true }, BURST_OPTS, PRIORITY.SCHEDULED)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[nor-cal-daily] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[nor-cal-daily] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startNorCalCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls); // every minute
  console.log("[nor-cal-daily] scheduler started — daily 11:00 AM / 2:30 PM / 6:00 PM local callbacks (per-minute sweep).");
  return task;
}

module.exports = {
  scheduleNorCalSignupCall,
  startNorCalCallScheduler,
  nextDailyCallAt,
};
