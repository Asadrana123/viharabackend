// services/rensselaerAveCallScheduler.js
//
// Auction-registration call flow for 401 Rensselaer Ave — a faithful clone of
// earlyAccessCallScheduler.js, pointed at rensselaerAveLeadModel and using this
// property's prompt (config/rensselaerAveVoicePrompt.js). Same behaviour:
//
//   Signup (with consent):
//     → 2-in-60s burst (60s initial wait to honour the "we'll call you" promise)
//         • picked up  → callStatus="connected", loop STOPS
//         • no pickup  → callStatus="no-answer", nextCallAt = next daily slot
//
//   3x/day at 11:00 AM, 2:30 PM, 6:00 PM in the lead's timezone (per-minute sweep):
//     → 2-in-60s burst again
//         • picked up  → "connected", STOP forever
//         • no pickup  → reschedule for the next slot (or 11:00 AM tomorrow)
//
// Pickup is decided by runCallBurst's return value (same as early access) — no
// webhook is required. State lives on the lead (nextCallAt + callStatus) so it
// survives restarts. Same-number guard: at most ONE call per normalized phone
// per daily sweep.
//
// CONCURRENCY: bursts are not dialed directly — they are handed to the shared
// callDispatchQueue, which caps how many run at once (account-wide, across all
// schedulers) and staggers their starts so a 6:00 PM batch cannot blow past
// VAPI's concurrency limit. Signup bursts use the high-priority lane.
//
// PROMPT: every call for this page must use the Georgia St prompt. The shared
// dispatcher (registrationCallService.runCallBurst) currently selects the prompt
// internally, so we pass it through the payload as `promptConfig`. See the note
// in INTEGRATION.md — runCallBurst must use payload.promptConfig when present.

const cron = require("node-cron");
const { DateTime } = require("luxon");
const RensselaerAveLead = require("../model/rensselaerAveLeadModel");
const rensselaerAveVoicePrompt = require("../config/rensselaerAveVoicePrompt");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");

// Three daily follow-up slots in the lead's local timezone (24h clock).
// A no-answer rolls the lead to the NEXT slot; after the last slot of the day it
// rolls to the first slot tomorrow. Keep this list sorted ascending.
const CALL_SLOTS = [
  { hour: 11, minute: 0 },  // 11:00 AM
  { hour: 14, minute: 30 }, // 2:30 PM
  { hour: 18, minute: 0 },  // 6:00 PM
];
const DEFAULT_TZ = "America/New_York"; // property is in NY; used only when a lead has no/invalid tz
const SWEEP_BATCH = 200;                  // max leads evaluated per minute

// Burst options: broad no-pickup set + treat errors as no-pickup, so the loop
// only stops on a real human pickup. Identical to early access.
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
 * `promptConfig` pins THIS property's prompt for every dial; `source` tags it.
 */
function callPayload(lead) {
  return {
    leadId: lead._id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone, // dial the canonical E.164 form
    buyerType: lead.buyerType,
    promptConfig: rensselaerAveVoicePrompt,        // { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
    source: "auction-449-rensselaer-ave",
  };
}

/**
 * Persist a burst outcome.
 *   connected → stop this lead (and any sibling leads on the same number).
 *   no pickup → schedule the next daily slot.
 */
async function applyOutcome(lead, connected) {
  if (connected) {
    await RensselaerAveLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "connected", nextCallAt: null } }
    );
    if (lead.phoneNormalized) {
      await RensselaerAveLead.updateMany(
        { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await RensselaerAveLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "no-answer", nextCallAt: nextDailyCallAt(lead.timezone) } }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a lead registers
 * with consent. Runs the burst (60s initial wait), then stops or schedules the
 * first daily callback.
 *
 * @param {object} lead  { leadId, fullName, email, phone, phoneNormalized, timezone, buyerType }
 */
async function scheduleRensselaerAveSignupCall(lead = {}) {
  if (!lead || !lead.leadId) return;

  await RensselaerAveLead.updateOne(
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
    const due = await RensselaerAveLead.find({
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
        await RensselaerAveLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: { nextCallAt: nextDailyCallAt(lead.timezone) } }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim: move nextCallAt to the next slot + stamp lastCallAt so an
      // overlapping tick can't re-dial the lead today.
      const claimed = await RensselaerAveLead.findOneAndUpdate(
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
        .catch((e) => console.error("[raa-daily] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[raa-daily] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startRensselaerAveCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls); // every minute
  console.log("[raa-daily] scheduler started — daily 11:00 AM / 2:30 PM / 6:00 PM local callbacks (per-minute sweep).");
  return task;
}

module.exports = {
  scheduleRensselaerAveSignupCall,
  startRensselaerAveCallScheduler,
  nextDailyCallAt,
};
