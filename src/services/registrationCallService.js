// services/registrationCallService.js
//
// Shared registration-call primitives.
//
//   • runCallBurst(lead, opts)          — reusable "up to two calls in a row"
//                                          burst. Used by BOTH the persona flow
//                                          (below) and the early-access daily
//                                          scheduler.
//   • scheduleRegistrationCall(lead)    — PERSONA-1 flow. Unchanged behaviour:
//                                          at most two calls, ever, then stop.
//                                          No daily loop.
//
// The early-access daily-callback loop lives in earlyAccessCallScheduler.js and
// reuses runCallBurst — persona behaviour is therefore untouched.
//
// Runs as fire-and-forget background work. The backend is a long-lived Render
// process, so in-memory setTimeout timers inside a single burst are safe.

const { dispatchRegistrationCall } = require("./leadCallService");
const { getCall } = require("./vapiService");

const WAIT_MS = 60 * 1000;         // 60s before the first call, and before the retry
const POLL_EVERY_MS = 10 * 1000;   // check call status every 10s
const POLL_MAX_MS = 5 * 60 * 1000; // give up polling after 5 min (assume answered)

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// PERSONA retry set — the original behaviour. Retry ONLY on a genuine
// ring-out / no-answer; a person who actively declines is not called again.
const RETRY_REASONS = new Set([
  "no-answer",
  "customer-did-not-answer",
  "silence-timed-out",
  "voicemail",
]);

// EARLY-ACCESS "did not reach a human" set (broader). Used by the daily loop
// where the ONLY stop condition is a genuine pickup — busy lines and dispatch
// errors count as no-pickup and keep the loop going.
const DID_NOT_CONNECT_REASONS = new Set([
  "no-answer",
  "customer-did-not-answer",
  "customer-busy",
  "silence-timed-out",
  "voicemail",
  "call-start-error",
  "twilio-failed-to-connect-call",
  "pipeline-error",
]);

// /*
//  * Decide whether a completed call reached a human.
//  * @param {object} call
//  * @param {Set<string>} noPickupReasons  reasons that mean "no pickup"
//  * @param {boolean} treatErrorsAsNoPickup  also treat any *error*/*failed* reason
//  *                                          as no-pickup (early-access only)
//  * @returns {boolean} true when the person engaged (a pickup)
//  */
function isPickup(call, noPickupReasons, treatErrorsAsNoPickup) {
  const reason = String(call?.endedReason || "").toLowerCase();
  if (!reason) return false;
  if (noPickupReasons.has(reason)) return false;
  if (treatErrorsAsNoPickup && (reason.includes("error") || reason.includes("failed")))
    return false;
  return true;
}

/**
 * Poll VAPI until the call ends (or we time out).
 * @returns {{ connected: boolean }}  connected=true only when a human engaged.
 */
async function pollCallOutcome(callId, noPickupReasons, treatErrorsAsNoPickup) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_MAX_MS) {
    await delay(POLL_EVERY_MS);
    let call;
    try {
      call = await getCall(callId);
    } catch (err) {
      console.error(`[reg-call] poll failed for ${callId}:`, err.message);
      continue; // transient — keep trying until timeout
    }

    if (String(call.status).toLowerCase() === "ended") {
      const connected = isPickup(call, noPickupReasons, treatErrorsAsNoPickup);
      console.log(`[reg-call] ended reason="${call.endedReason}" → connected=${connected}`);
      return { connected };
    }
  }

  // Still going after POLL_MAX_MS — they're almost certainly talking. Pickup.
  return { connected: true };
}

/**
 * Reusable burst for ONE lead:
 *   [optional initial wait] → call → if no pickup, wait 60s → call once more.
 * Resolves when the burst finishes. Places at most two calls.
 *
 * @param {object} lead
 * @param {object} [opts]
 * @param {number} [opts.initialDelayMs=0]        wait before the first call
 * @param {Set<string>} [opts.noPickupReasons]    reasons meaning "no pickup"
 *                                                 (defaults to persona RETRY_REASONS)
 * @param {boolean} [opts.treatErrorsAsNoPickup=false]
 * @returns {{ connected: boolean }}
 */
async function runCallBurst(
  lead = {},
  { initialDelayMs = 0, noPickupReasons = RETRY_REASONS, treatErrorsAsNoPickup = false } = {}
) {
  const who = lead.fullName || lead.phone || "lead";
  if (initialDelayMs > 0) await delay(initialDelayMs);

  // ── Attempt 1 ──────────────────────────────────────────────────────────
  const first = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 1 → ${who}:`, first);
  if (!first.success || !first.callId) return { connected: false };

  const firstOutcome = await pollCallOutcome(first.callId, noPickupReasons, treatErrorsAsNoPickup);
  if (firstOutcome.connected) {
    console.log(`[reg-call] ${who}: connected on attempt 1.`);
    return { connected: true };
  }

  // ── Attempt 2 (no pickup) — final call of this burst ───────────────────
  await delay(WAIT_MS);
  const second = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 2 (no-answer retry) → ${who}:`, second);
  if (!second.success || !second.callId) return { connected: false };

  const secondOutcome = await pollCallOutcome(second.callId, noPickupReasons, treatErrorsAsNoPickup);
  console.log(`[reg-call] ${who}: connected=${secondOutcome.connected} after burst.`);
  return { connected: secondOutcome.connected };
}

/**
 * PERSONA-1 registration flow — unchanged behaviour: wait 60s, call, retry once
 * only on a genuine no-answer, then STOP. No daily loop.
 */
const scheduleRegistrationCall = async (lead = {}) => {
  await runCallBurst(lead, {
    initialDelayMs: WAIT_MS,
    noPickupReasons: RETRY_REASONS,
    treatErrorsAsNoPickup: false,
  });
};

module.exports = {
  scheduleRegistrationCall,
  runCallBurst,
  RETRY_REASONS,
  DID_NOT_CONNECT_REASONS,
  WAIT_MS,
};
