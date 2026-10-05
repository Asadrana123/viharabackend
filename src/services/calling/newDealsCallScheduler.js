// services/newDealsCallScheduler.js
//
// /new-deals call flow — same loop as the Northern California page:
//
//   Signup (with consent):
//     → 2-in-60s burst
//         • picked up  → callStatus="connected", loop STOPS
//         • no pickup  → callStatus="no-answer", nextCallAt = next daily slot
//
//   Follow-up (followUpCadence.js): ONE call a day for 7 days in the lead's
//   timezone, rotating 11:00 AM / 2:30 PM / 6:00 PM (per-minute sweep)
//         • picked up  → "connected", STOP
//         • no pickup  → next day's slot; after day 7 → "not-reached" (admin decides)
//
// Maya speaks newDealsVoicePrompt; asking for an advisor transfers the call to
// the forwarding number saved on the VAPI assistant.

const cron = require("node-cron");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const { FOLLOW_UP_DAYS, FOLLOW_UP_CALL_OPTS, nextFollowUpAt, noAnswerUpdate, skipUpdate } = require("./followUpCadence");
const newDealsVoicePrompt = require("../../config/newDealsVoicePrompt");
const { dealSpoken } = require("../../config/newDeals");
const { spokenList, spokenBudget, stateName } = require("../leads/buyBox");

// MD / MI / LA markets — Eastern is the safest fallback when the browser sent no tz.
const DEFAULT_TZ = "America/New_York";
const SWEEP_BATCH = 200;

const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
};

/** Payload the dispatcher expects — buy-box answers in a form Maya can speak. */
function callPayload(lead) {
  const box = lead.buyBox || {};
  const where = [
    ...(box.states || []).map(stateName),
    ...(box.cities || []),
  ].join(", ");

  return {
    leadId: lead._id,
    fullName: lead.fullName || lead.firstName,
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone,
    timezone: lead.timezone || "",
    market: (box.states || []).map(stateName).join(", "),
    buyerType: spokenList("strategy", box.strategy),
    where,
    budget: spokenBudget(box),
    strategy: spokenList("strategy", box.strategy),
    propertyTypes: spokenList("property_type", box.property_type),
    financing: spokenList("financing", box.financing),
    condition: spokenList("condition", box.condition),
    dealVolume: spokenList("deals_12mo", box.deals_12mo),
    dealInterest: dealSpoken(lead.dealInterest),
    advisorRequested: lead.advisorCallRequested ? "yes" : "no",
    promptConfig: newDealsVoicePrompt,
    source: "new-deals",
  };
}

/** connected → stop this lead (and siblings on the same number); else next slot. */
async function applyOutcome(lead, connected) {
  if (connected) {
    await NewDealsLead.updateOne({ _id: lead._id }, { $set: { callStatus: "connected", nextCallAt: null } });
    if (lead.phoneNormalized) {
      await NewDealsLead.updateMany(
        { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await NewDealsLead.updateOne(
      { _id: lead._id },
      { $set: noAnswerUpdate(lead, DEFAULT_TZ) }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a consented
 * sign-up. Waits WAIT_MS (the "we call you within a minute" promise), bursts,
 * then stops or schedules the first daily callback.
 *
 * @param {object} lead  the newDealsLeadModel doc (plain object)
 */
async function scheduleNewDealsSignupCall(lead) {
  if (!lead || !lead._id) return;

  await NewDealsLead.updateOne(
    { _id: lead._id },
    { $set: { lastCallAt: new Date(), callStatus: "pending", nextCallAt: null }, $inc: { callAttempts: 1 } }
  );

  const { connected } = await enqueueBurst(
    callPayload(lead),
    { initialDelayMs: WAIT_MS, ...BURST_OPTS },
    PRIORITY.SIGNUP
  );

  await applyOutcome(lead, connected);
}

// ─── Daily sweep ──────────────────────────────────────────────────────────────

let sweeping = false;

async function sweepDueCalls() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();
    const due = await NewDealsLead.find({
      callStatus: "no-answer",
      nextCallAt: { $ne: null, $lte: now },
      consent: true,
      callingStopped: { $ne: true },
    })
      .sort({ nextCallAt: 1 })
      .limit(SWEEP_BATCH)
      .lean();

    if (due.length === 0) return;

    const dialedNumbers = new Set();
    for (const lead of due) {
      // 7-day window over / already called today → no dial, just reschedule.
      const skip = skipUpdate(lead, DEFAULT_TZ, now);
      if (skip) {
        await NewDealsLead.updateOne({ _id: lead._id, callStatus: "no-answer" }, { $set: skip });
        continue;
      }

      const num = lead.phoneNormalized || "";
      if (num && dialedNumbers.has(num)) {
        await NewDealsLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: noAnswerUpdate(lead, DEFAULT_TZ) }
        );
        continue;
      }
      if (num) dialedNumbers.add(num);

      // Atomic claim so an overlapping tick can't re-dial the lead.
      const claimed = await NewDealsLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextFollowUpAt(lead, DEFAULT_TZ, now), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();
      if (!claimed) continue;

      enqueueBurst({ ...callPayload(claimed), isFollowUp: true }, { ...BURST_OPTS, ...FOLLOW_UP_CALL_OPTS }, PRIORITY.SCHEDULED)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[new-deals-daily] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[new-deals-daily] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startNewDealsCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls);
  console.log(`[new-deals-daily] scheduler started — one follow-up call a day for ${FOLLOW_UP_DAYS} days, rotating 11:00 AM / 2:30 PM / 6:00 PM local (per-minute sweep).`);
  return task;
}

module.exports = {
  scheduleNewDealsSignupCall,
  startNewDealsCallScheduler,
  callPayload,
};
