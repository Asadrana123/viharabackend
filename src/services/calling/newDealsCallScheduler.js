// services/newDealsCallScheduler.js
//
// /new-deals call flow — same loop as the Northern California page:
//
//   Signup (with consent):
//     → one signup call
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
//
// The same loop runs for Facebook / Instagram instant-form leads
// (facebookFormLeadModel, same buy-box shape) with its own collection and
// call source "facebook-form": createBuyBoxCallScheduler() below.

const cron = require("node-cron");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const { FOLLOW_UP_DAYS, FOLLOW_UP_CALL_OPTS, nextFollowUpAt, noAnswerUpdate, skipUpdate } = require("./followUpCadence");
const newDealsVoicePrompt = require("../../config/newDealsVoicePrompt");
const { facebookFormPromptFor } = require("../../config/facebookFormVoicePrompt");
const { dealSpoken } = require("../../config/newDeals");
const { spokenList, spokenBudget, stateName } = require("../leads/buyBox");
const { TOORAK_FORM_IDS } = require("../../config/toorakForms");

// MD / MI / LA markets — Eastern is the safest fallback when the browser sent no tz.
const DEFAULT_TZ = "America/New_York";
const SWEEP_BATCH = 200;

const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
  // A quick "hello?" / "I'm busy" isn't a pickup — keep calling until there's
  // a real conversation (registrationCallService.hadMeaningfulConversation).
  requireConversation: true,
};

/** Payload the dispatcher expects — buy-box answers in a form Maya can speak. */
function callPayload(lead, source = "new-deals") {
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
    source,
  };
}

/**
 * The signup call + 7-day daily follow-up loop for one buy-box lead collection.
 * @param {object} p
 * @param {import("mongoose").Model} p.Model  newDealsLead or facebookFormLead
 * @param {string} p.source                   call source (also picks Maya's script on callbacks)
 * @param {string} p.logTag                   log prefix
 * @param {Function} [p.payloadFor]           lead → call payload (default: callPayload with this source)
 * @param {object} [p.sweepFilter]            extra condition for the daily sweep (leads another scheduler owns)
 */
function createBuyBoxCallScheduler({ Model, source, logTag, payloadFor = (lead) => callPayload(lead, source), sweepFilter = {} }) {
  /** connected → stop this lead (and siblings on the same number); else next slot. */
  async function applyOutcome(lead, connected) {
    if (connected) {
      await Model.updateOne({ _id: lead._id }, { $set: { callStatus: "connected", nextCallAt: null } });
      if (lead.phoneNormalized) {
        await Model.updateMany(
          { phoneNormalized: lead.phoneNormalized, callStatus: "no-answer", _id: { $ne: lead._id } },
          { $set: { callStatus: "connected", nextCallAt: null } }
        );
      }
    } else {
      await Model.updateOne(
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
   * @param {object} lead  the lead doc (plain object)
   */
  async function scheduleSignupCall(lead) {
    if (!lead || !lead._id) return;

    await Model.updateOne(
      { _id: lead._id },
      { $set: { lastCallAt: new Date(), callStatus: "pending", nextCallAt: null }, $inc: { callAttempts: 1 } }
    );

    const { connected } = await enqueueBurst(
      payloadFor(lead),
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
      const due = await Model.find({
        callStatus: "no-answer",
        nextCallAt: { $ne: null, $lte: now },
        consent: true,
        callingStopped: { $ne: true },
        ...sweepFilter,
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
          await Model.updateOne({ _id: lead._id, callStatus: "no-answer" }, { $set: skip });
          continue;
        }

        const num = lead.phoneNormalized || "";
        if (num && dialedNumbers.has(num)) {
          await Model.updateOne(
            { _id: lead._id, callStatus: "no-answer" },
            { $set: noAnswerUpdate(lead, DEFAULT_TZ) }
          );
          continue;
        }
        if (num) dialedNumbers.add(num);

        // Atomic claim so an overlapping tick can't re-dial the lead.
        const claimed = await Model.findOneAndUpdate(
          { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
          {
            $set: { nextCallAt: nextFollowUpAt(lead, DEFAULT_TZ, now), lastCallAt: now },
            $inc: { callAttempts: 1 },
          },
          { new: true }
        ).lean();
        if (!claimed) continue;

        enqueueBurst({ ...payloadFor(claimed), isFollowUp: true }, { ...BURST_OPTS, ...FOLLOW_UP_CALL_OPTS }, PRIORITY.SCHEDULED)
          .then(({ connected }) => applyOutcome(claimed, connected))
          .catch((e) => console.error(`[${logTag}] burst failed:`, e.message));
      }
    } catch (e) {
      console.error(`[${logTag}] sweep error:`, e.message);
    } finally {
      sweeping = false;
    }
  }

  let task = null;

  /** Start the every-minute daily-callback sweep. Call once, after the server boots. */
  function start() {
    if (task) return task;
    task = cron.schedule("* * * * *", sweepDueCalls);
    console.log(`[${logTag}] scheduler started — one follow-up call a day for ${FOLLOW_UP_DAYS} days, rotating 11:00 AM / 2:30 PM / 6:00 PM local (per-minute sweep).`);
    return task;
  }

  return { scheduleSignupCall, start, sweepDueCalls };
}

const newDealsCalls = createBuyBoxCallScheduler({ Model: NewDealsLead, source: "new-deals", logTag: "new-deals-daily" });
/**
 * Facebook / Instagram instant-form leads: the form decides Maya's script
 * (config/facebookFormVoicePrompt.js), and every answer on the form is passed
 * as {{prospect_form_answers}} ("Question: answer; ...").
 */
const CONTACT_KEYS = /^(full_name|first_name|last_name|email|phone_number|phone)$/;
function facebookFormPayload(lead) {
  const answers = (lead.answers || []).filter((a) => !CONTACT_KEYS.test(a.key));
  const timeline = answers.find((a) => /timeline|when/i.test(a.key));
  return {
    ...callPayload(lead, "facebook-form"),
    promptConfig: facebookFormPromptFor(lead.formName),
    formAnswers: answers.map((a) => `${a.question}: ${a.label || a.value}`).join("; "),
    timeline: timeline ? timeline.label || timeline.value : "",
  };
}

const facebookFormCalls = createBuyBoxCallScheduler({
  Model: FacebookFormLead,
  source: "facebook-form",
  logTag: "facebook-form-daily",
  payloadFor: facebookFormPayload,
  // Toorak lead forms have their own 3-attempt schedule (toorakCallScheduler.js).
  // The form id check also covers Toorak leads saved before they were tagged.
  sweepFilter: { toorak: null, formId: { $nin: TOORAK_FORM_IDS } },
});

module.exports = {
  scheduleNewDealsSignupCall: newDealsCalls.scheduleSignupCall,
  startNewDealsCallScheduler: newDealsCalls.start,
  scheduleFacebookFormSignupCall: facebookFormCalls.scheduleSignupCall,
  startFacebookFormCallScheduler: facebookFormCalls.start,
  createBuyBoxCallScheduler,
  callPayload,
  facebookFormPayload,
};
