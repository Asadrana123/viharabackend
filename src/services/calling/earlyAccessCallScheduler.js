// services/earlyAccessCallScheduler.js
//
// Early-access call flow with a 7-day follow-up loop:
//
//   Signup (with consent):
//     → 2-in-60s burst (same as persona "as we call now")
//         • picked up  → callStatus="connected", loop STOPS
//         • no pickup  → callStatus="no-answer", nextCallAt = next daily slot
//
//   Follow-up (followUpCadence.js): ONE call a day for 7 days in the lead's
//   timezone, rotating 11:00 AM / 2:30 PM / 6:00 PM (per-minute sweep)
//         • picked up  → "connected", STOP
//         • no pickup  → next day's slot; after day 7 → "not-reached" (admin decides)
//
// State is stored on the lead (nextCallAt + callStatus), so it survives Render
// restarts;
// a raw setTimeout would not.
//
// Same-number guard: at most ONE call per normalized phone per daily sweep, so
// two people who registered with the same number aren't both dialed.
//
// CONCURRENCY: bursts are not dialed directly — they are handed to the shared
// callDispatchQueue, which caps how many run at once (account-wide, across all
// schedulers) and staggers their starts so a 6:00 PM batch cannot blow past
// VAPI's concurrency limit. Signup bursts use the high-priority lane so a fresh
// lead is never stuck behind a batch of routine retries.

const cron = require("node-cron");
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const { FOLLOW_UP_DAYS, FOLLOW_UP_CALL_OPTS, nextFollowUpAt, noAnswerUpdate, skipUpdate } = require("./followUpCadence");
const earlyAccessVoicePrompt = require("../../config/earlyAccessVoicePrompt");

const DEFAULT_TZ = "America/New_York"; // fallback when a lead has no/invalid tz
const SWEEP_BATCH = 200;               // max leads evaluated per minute

// Burst options for early access: broad no-pickup set + treat errors as
// no-pickup, so the loop only stops on a real human pickup.
const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
  // A quick "hello?" / "I'm busy" isn't a pickup — keep calling until there's
  // a real conversation (registrationCallService.hadMeaningfulConversation).
  requireConversation: true,
};

/**
 * Payload the dispatcher expects (canonical phone + prompt vars).
 * `promptConfig` pins the early-access prompt for every dial; `source` tags it.
 */
function callPayload(lead) {
  return {
    leadId: lead._id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone, // dial the canonical E.164 form
    timezone: lead.timezone || "", // caller's tz: Maya's clock + callback times
    market: lead.markets,
    buyerType: lead.buyerType,
    dealSize: lead.dealSize,
    promptConfig: earlyAccessVoicePrompt,      // { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
    source: "early-access",
  };
}

/**
 * Persist a burst outcome.
 *   connected → stop this lead (and any sibling leads on the same number).
 *   no pickup → schedule the next daily slot.
 */
async function applyOutcome(lead, connected) {
  if (connected) {
    await EarlyAccessLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "connected", nextCallAt: null } }
    );
    // The number answered — stop other pending loops on the same number.
    if (lead.phoneNormalized) {
      await EarlyAccessLead.updateMany(
        { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await EarlyAccessLead.updateOne(
      { _id: lead._id },
      { $set: noAnswerUpdate(lead, DEFAULT_TZ) }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a lead
 * registers with consent. Runs the burst (60s initial wait to honour the
 * "concierge calls you within 60 seconds" promise), then stops or schedules the
 * first daily callback.
 *
 * @param {object} lead  { leadId, fullName, email, phone, phoneNormalized, timezone, market, buyerType, dealSize }
 */
async function scheduleEarlyAccessSignupCall(lead = {}) {
  if (!lead || !lead.leadId) return;

  await EarlyAccessLead.updateOne(
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
    const due = await EarlyAccessLead.find({
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
      // 7-day window over / already called today → no dial, just reschedule.
      const skip = skipUpdate(lead, DEFAULT_TZ, now);
      if (skip) {
        await EarlyAccessLead.updateOne({ _id: lead._id, callStatus: "no-answer" }, { $set: skip });
        continue;
      }

      const num = lead.phoneNormalized || "";

      // Same-number dedup: only the first lead on a number fires this sweep;
      // push the rest to the next slot so they don't pile up today.
      if (num && dialedNumbers.has(num)) {
        await EarlyAccessLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: noAnswerUpdate(lead, DEFAULT_TZ) }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim: move nextCallAt to the next slot + stamp lastCallAt so an
      // overlapping tick (or a long-running burst) can't re-dial the lead today.
      const claimed = await EarlyAccessLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextFollowUpAt(lead, DEFAULT_TZ, now), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      // Hand the burst to the shared queue (scheduled lane — paced behind any
      // signup bursts, no initial delay since it's already a call slot in their time).
      enqueueBurst({ ...callPayload(claimed), isFollowUp: true }, { ...BURST_OPTS, ...FOLLOW_UP_CALL_OPTS }, PRIORITY.SCHEDULED)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[ea-daily] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[ea-daily] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startEarlyAccessCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls); // every minute
  console.log(`[ea-daily] scheduler started — one follow-up call a day for ${FOLLOW_UP_DAYS} days, rotating 11:00 AM / 2:30 PM / 6:00 PM local (per-minute sweep).`);
  return task;
}

module.exports = {
  scheduleEarlyAccessSignupCall,
  startEarlyAccessCallScheduler,
};
