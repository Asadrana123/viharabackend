// services/calling/toorakCallScheduler.js
//
// Maya's calls for Toorak lead-form leads (config/toorakForms.js), per
// marketing (28 Oct 2026). Replaces the 7-day loop for these leads:
//
//   Every Toorak lead: the call_consent checkbox (consentSource
//   "form-checkbox") or, without it, the admin override (admin, 28 Oct 2026).
//   "Stop calling" in admin ends it.
//
//   Attempt 1  T+5 min
//   Attempt 2  1 hour after attempt 1
//   Attempt 3  the next day (24 h after attempt 2)
//   then       callStatus "not-reached" → status "unreachable"
//
//   Every attempt between 8 AM and 9 PM in the lead's time zone (from the
//   property / market state); a time outside that moves to 8 AM next morning.
//   Hot leads are dialed first. A pickup with a real conversation stops it.

const cron = require("node-cron");
const { DateTime } = require("luxon");
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { DID_NOT_CONNECT_REASONS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const { facebookFormPayload } = require("./newDealsCallScheduler");
const { writebackLeadStatus } = require("../leads/toorakStatusWriteback");

const FALLBACK_TZ = "America/New_York";
const WINDOW_START = 8; // 8 AM
const WINDOW_END = 21; // 9 PM
const FIRST_DELAY_MIN = 5;
const MAX_ATTEMPTS = 3;
const SWEEP_BATCH = 100;

const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
  requireConversation: true,
  maxCalls: 1, // one dial per attempt
};

const zoneOf = (lead) => {
  const zone = lead?.timezone || FALLBACK_TZ;
  return DateTime.now().setZone(zone).isValid ? zone : FALLBACK_TZ;
};

/** `at`, moved into the 8 AM–9 PM window of the lead's time zone. */
function inCallWindow(at, zone) {
  const local = DateTime.fromJSDate(at).setZone(zone || FALLBACK_TZ);
  if (local.hour < WINDOW_START) return local.set({ hour: WINDOW_START, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  if (local.hour >= WINDOW_END) return local.plus({ days: 1 }).set({ hour: WINDOW_START, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  return at;
}

/** When attempt number `attempt` (1-based) is due, after the previous one at `from`. null = no more. */
function nextAttemptAt(attempt, from, zone) {
  if (attempt > MAX_ATTEMPTS) return null;
  const delayMs = attempt === 1 ? FIRST_DELAY_MIN * 60e3 : attempt === 2 ? 60 * 60e3 : 24 * 60 * 60e3;
  return inCallWindow(new Date(from.getTime() + delayMs), zone);
}

/** Can Maya call this Toorak lead? Consent on record (checkbox or admin override), and not stopped. */
const mayCall = (lead) => lead?.consent === true && !lead.callingStopped;

/** A new consented Toorak lead: queue attempt 1 (T+5 min, in the window). */
async function scheduleToorakCalls(lead, now = new Date()) {
  if (!lead?._id || !mayCall(lead)) return null;
  if (["connected", "not-reached"].includes(lead.callStatus) || lead.nextCallAt) return null; // already in (or done with) the loop
  const nextCallAt = nextAttemptAt(1, now, zoneOf(lead));
  await FacebookFormLead.updateOne({ _id: lead._id }, { $set: { callStatus: "pending", nextCallAt, callAttempts: 0 } });
  return nextCallAt;
}

async function applyOutcome(lead, connected, now = new Date()) {
  if (connected) {
    await FacebookFormLead.updateOne({ _id: lead._id }, { $set: { callStatus: "connected", nextCallAt: null } });
    writebackLeadStatus(lead, "contacted").catch(() => {});
    return;
  }
  const next = nextAttemptAt((lead.callAttempts || 0) + 1, now, zoneOf(lead));
  await FacebookFormLead.updateOne(
    { _id: lead._id },
    { $set: next ? { callStatus: "no-answer", nextCallAt: next } : { callStatus: "not-reached", nextCallAt: null } }
  );
  if (!next) writebackLeadStatus(lead, "unreachable").catch(() => {});
}

let sweeping = false;

async function sweepToorakCalls() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();
    const due = await FacebookFormLead.find({
      toorak: { $ne: null },
      consent: true,
      callingStopped: { $ne: true },
      callStatus: { $in: ["pending", "no-answer"] },
      nextCallAt: { $ne: null, $lte: now },
    })
      .sort({ hot: -1, nextCallAt: 1 })
      .limit(SWEEP_BATCH)
      .lean();

    for (const lead of due) {
      // Due while outside the window (e.g. the server was down overnight) → 8 AM.
      const windowed = inCallWindow(now, zoneOf(lead));
      if (windowed.getTime() !== now.getTime()) {
        await FacebookFormLead.updateOne({ _id: lead._id, nextCallAt: lead.nextCallAt }, { $set: { nextCallAt: windowed } });
        continue;
      }
      // Claim, so an overlapping tick can't dial twice.
      const claimed = await FacebookFormLead.findOneAndUpdate(
        { _id: lead._id, nextCallAt: lead.nextCallAt },
        { $set: { nextCallAt: null, lastCallAt: now }, $inc: { callAttempts: 1 } },
        { new: true }
      ).lean();
      if (!claimed) continue;

      const priority = claimed.callAttempts === 1 || claimed.hot ? PRIORITY.SIGNUP : PRIORITY.SCHEDULED;
      enqueueBurst({ ...facebookFormPayload(claimed), isFollowUp: claimed.callAttempts > 1 }, BURST_OPTS, priority)
        .then(({ connected }) => applyOutcome(claimed, connected))
        .catch((e) => console.error("[toorak-calls] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[toorak-calls] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

function startToorakCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepToorakCalls);
  console.log("[toorak-calls] scheduler started — 3 attempts (T+5 min, +1 h, next day), 8 AM–9 PM local, every Toorak lead.");
  return task;
}

module.exports = { scheduleToorakCalls, startToorakCallScheduler, sweepToorakCalls, inCallWindow, nextAttemptAt, mayCall };
