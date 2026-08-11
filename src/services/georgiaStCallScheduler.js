// services/georgiaStCallScheduler.js
//
// Auction-registration call flow for 449 Georgia St — a faithful clone of
// earlyAccessCallScheduler.js, pointed at georgiaStLeadModel and using this
// property's prompt (config/georgiaStVoicePrompt.js). Same behaviour:
//
//   Signup (with consent):
//     → 2-in-60s burst (60s initial wait to honour the "we'll call you" promise)
//         • picked up  → callStatus="connected", loop STOPS
//         • no pickup  → callStatus="no-answer", nextCallAt = next 1:32 PM local
//
//   Every day at 1:32 PM in the lead's timezone (per-minute cron sweep):
//     → 2-in-60s burst again
//         • picked up  → "connected", STOP forever
//         • no pickup  → reschedule for tomorrow 1:32 PM local
//
// Pickup is decided by runCallBurst's return value (same as early access) — no
// webhook is required. State lives on the lead (nextCallAt + callStatus) so it
// survives restarts. Same-number guard: at most ONE call per normalized phone
// per daily sweep.
//
// PROMPT: every call for this page must use the Georgia St prompt. The shared
// dispatcher (registrationCallService.runCallBurst) currently selects the prompt
// internally, so we pass it through the payload as `promptConfig`. See the note
// in INTEGRATION.md — runCallBurst must use payload.promptConfig when present.

const cron = require("node-cron");
const { DateTime } = require("luxon");
const GeorgiaStLead = require("../model/georgiaStLeadModel");
const georgiaStVoicePrompt = require("../config/georgiaStVoicePrompt");
const { runCallBurst, DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");

const CALL_HOUR = 13;   // 1 PM
const CALL_MINUTE = 32; // :32  → 1:32 PM local
const DEFAULT_TZ = "America/Los_Angeles"; // property is in CA; used only when a lead has no/invalid tz
const SWEEP_BATCH = 200;                  // max leads evaluated per minute

// Burst options: broad no-pickup set + treat errors as no-pickup, so the loop
// only stops on a real human pickup. Identical to early access.
const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
};

/**
 * Next 1:32 PM in the lead's timezone, as a UTC Date.
 * Today if it's still before 1:32 PM there, otherwise tomorrow. DST-correct.
 */
function nextDailyCallAt(timezone) {
  const zone = timezone || DEFAULT_TZ;
  let now = DateTime.now().setZone(zone);
  if (!now.isValid) now = DateTime.now().setZone(DEFAULT_TZ);

  let target = now.set({ hour: CALL_HOUR, minute: CALL_MINUTE, second: 0, millisecond: 0 });
  if (target <= now) target = target.plus({ days: 1 });
  return target.toUTC().toJSDate();
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
    promptConfig: georgiaStVoicePrompt,        // { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
    source: "auction-449-georgia-st",
  };
}

/**
 * Persist a burst outcome.
 *   connected → stop this lead (and any sibling leads on the same number).
 *   no pickup → schedule the next 1:32 PM local callback.
 */
async function applyOutcome(lead, connected) {
  if (connected) {
    await GeorgiaStLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "connected", nextCallAt: null } }
    );
    if (lead.phoneNormalized) {
      await GeorgiaStLead.updateMany(
        { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await GeorgiaStLead.updateOne(
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
async function scheduleGeorgiaStSignupCall(lead = {}) {
  if (!lead || !lead.leadId) return;

  await GeorgiaStLead.updateOne(
    { _id: lead.leadId },
    { $set: { lastCallAt: new Date() }, $inc: { callAttempts: 1 } }
  );

  const { connected } = await runCallBurst(
    callPayload({ _id: lead.leadId, ...lead }),
    { initialDelayMs: WAIT_MS, ...BURST_OPTS }
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
    const due = await GeorgiaStLead.find({
      callStatus: "no-answer",
      nextCallAt: { $ne: null, $lte: now },
    })
      .sort({ nextCallAt: 1 })
      .limit(SWEEP_BATCH)
      .lean();

    if (due.length === 0) return;

    const dialedNumbers = new Set(); // per-sweep same-number dedup

    for (const lead of due) {
      const num = lead.phoneNormalized || "";

      // Same-number dedup: only the first lead on a number fires this sweep;
      // push the rest to tomorrow so they don't pile up today.
      if (num && dialedNumbers.has(num)) {
        await GeorgiaStLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: { nextCallAt: nextDailyCallAt(lead.timezone) } }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim: move nextCallAt to tomorrow + stamp lastCallAt so an
      // overlapping tick can't re-dial the lead today.
      const claimed = await GeorgiaStLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextDailyCallAt(lead.timezone), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      // Fire the burst (no initial delay — it's already 1:32 PM their time).
      runCallBurst(callPayload(claimed), BURST_OPTS)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[gsa-daily] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[gsa-daily] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startGeorgiaStCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls); // every minute
  console.log("[gsa-daily] scheduler started — daily 1:32 PM local callbacks (per-minute sweep).");
  return task;
}

module.exports = {
  scheduleGeorgiaStSignupCall,
  startGeorgiaStCallScheduler,
  nextDailyCallAt,
};
