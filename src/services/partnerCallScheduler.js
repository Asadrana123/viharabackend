// services/partnerCallScheduler.js
//
// Partner Program activation-call flow for /partners — a faithful clone of
// georgiaStCallScheduler.js, pointed at partnerLeadModel and this program's prompt
// (config/partnerProgramVoicePrompt.js). Same behaviour:
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
// Pickup is decided by the burst's return value (same as the property pages) — no
// webhook required. State lives on the lead (nextCallAt + callStatus) so it
// survives restarts. Same-number guard: at most ONE call per normalized phone per
// daily sweep (partners dedup on EMAIL, so two applicants can share a phone — this
// guard stops us dialing that shared number twice in one sweep).
//
// CONCURRENCY: bursts are handed to the shared callDispatchQueue, which caps how
// many run at once (account-wide, across all schedulers) and staggers their starts
// so a 1:32 PM batch cannot blow past VAPI's concurrency limit. Signup bursts use
// the high-priority lane.
//
// PROMPT: every call for this page uses the Partner Program prompt, pinned onto the
// payload as `promptConfig` (runCallBurst uses payload.promptConfig when present).

const cron = require("node-cron");
const { DateTime } = require("luxon");
const PartnerLead = require("../model/partnerLeadModel");
const partnerProgramVoicePrompt = require("../config/partnerProgramVoicePrompt");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");

const CALL_HOUR = 13;   // 1 PM
const CALL_MINUTE = 32; // :32  → 1:32 PM local
// Partners are US-wide, so there is no single property zone to anchor to. This is
// only the fallback when a lead's own `timezone` is blank — the page almost always
// sends a real IANA zone. Change if you'd prefer a different default.
const DEFAULT_TZ = "America/New_York";
const SWEEP_BATCH = 200; // max leads evaluated per minute

// Burst options: broad no-pickup set + treat errors as no-pickup, so the loop only
// stops on a real human pickup. Identical to the property-page schedulers.
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
 * Whole name Maya speaks. Partners are stored as first + last, but the prompt
 * variables ({{prospect_name}} / {{prospect_full_name}}) expect one full name.
 */
function fullNameOf(lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
}

/**
 * Payload the dispatcher expects (canonical phone + prompt vars).
 * `promptConfig` pins THIS program's prompt for every dial; `source` tags it.
 */
function callPayload(lead) {
  return {
    leadId: lead._id,
    fullName: fullNameOf(lead),
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone, // dial the canonical E.164 form
    promptConfig: partnerProgramVoicePrompt,   // { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
    source: "partner-program",
  };
}

/**
 * Persist a burst outcome.
 *   connected → stop this lead (and any sibling leads on the same number).
 *   no pickup → schedule the next 1:32 PM local callback.
 */
async function applyOutcome(lead, connected) {
  if (connected) {
    await PartnerLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "connected", nextCallAt: null } }
    );
    if (lead.phoneNormalized) {
      await PartnerLead.updateMany(
        { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await PartnerLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "no-answer", nextCallAt: nextDailyCallAt(lead.timezone) } }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a partner applies
 * with consent. Runs the burst (60s initial wait), then stops or schedules the
 * first daily callback.
 *
 * @param {object} lead { leadId, firstName, lastName, email, phone, phoneNormalized, timezone }
 */
async function schedulePartnerSignupCall(lead = {}) {
  if (!lead || !lead.leadId) return;

  await PartnerLead.updateOne(
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
    const due = await PartnerLead.find({
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

      // Same-number dedup: only the first lead on a number fires this sweep; push
      // the rest to tomorrow so they don't pile up today.
      if (num && dialedNumbers.has(num)) {
        await PartnerLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: { nextCallAt: nextDailyCallAt(lead.timezone) } }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim: move nextCallAt to tomorrow + stamp lastCallAt so an
      // overlapping tick can't re-dial the lead today.
      const claimed = await PartnerLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextDailyCallAt(lead.timezone), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      // Hand the burst to the shared queue (scheduled lane — paced behind any
      // signup bursts, no initial delay since it's already 1:32 PM their time).
    enqueueBurst({ ...callPayload(claimed), isFollowUp: true }, BURST_OPTS, PRIORITY.SCHEDULED)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[partner-daily] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[partner-daily] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startPartnerCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls); // every minute
  console.log("[partner-daily] scheduler started — daily 1:32 PM local callbacks (per-minute sweep).");
  return task;
}

module.exports = {
  schedulePartnerSignupCall,
  startPartnerCallScheduler,
  nextDailyCallAt,
};
