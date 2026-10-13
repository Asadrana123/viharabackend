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

// ─── Was it a real conversation? ─────────────────────────────────────────────
// For the follow-up loops a pickup alone isn't enough to stop calling: a quick
// "hello?" / "I'm busy" / hang-up keeps the lead in the loop. Judged from the
// transcript, which is on the call the moment it ends (VAPI's analysis summary
// arrives later, via the end-of-call webhook — too late for this decision).

// They asked us to stop — end the loop for good.
const STOP_PHRASES = [
  "stop calling", "remove me", "take me off", "don't call", "do not call",
  "not interested", "unsubscribe", "wrong number", "lose my number",
];
// Clear interest — a short reply still counts as a real conversation.
const INTEREST_PHRASES = [
  "interested", "send me", "tell me more", "sounds good", "sounds great",
  "advisor", "register", "sign me up", "yes please",
];
// Enough back-and-forth from the person to call it a conversation.
const MIN_USER_WORDS = 25;

function callMessages(call) {
  return call?.artifact?.messages || call?.messages || [];
}

function userText(call) {
  const fromMessages = callMessages(call)
    .filter((m) => m.role === "user")
    .map((m) => m.message || m.content || "")
    .join(" ");
  if (fromMessages.trim()) return fromMessages;
  // Fallback: "User: …" lines of the flat transcript.
  return String(call?.artifact?.transcript || call?.transcript || "")
    .split("\n")
    .filter((l) => l.startsWith("User:"))
    .map((l) => l.replace(/^User:\s*/, ""))
    .join(" ");
}

/**
 * @returns {boolean} true when the call was a real conversation (or a request
 * to stop / a booked callback) — i.e. the follow-up loop should end.
 */
function hadMeaningfulConversation(call) {
  // They booked a callback — the callback flow takes it from here.
  if (JSON.stringify(callMessages(call)).includes("scheduleCallback")) return true;

  const said = userText(call).toLowerCase();
  if (STOP_PHRASES.some((p) => said.includes(p))) return true;
  if (INTEREST_PHRASES.some((p) => said.includes(p))) return true;
  return said.split(/\s+/).filter(Boolean).length >= MIN_USER_WORDS;
}

/**
 * Poll VAPI until the call ends (or we time out).
 * @param {boolean} [requireConversation=false]  loops only: a pickup without a
 *   real conversation returns { connected: false, reached: true }
 * @returns {{ connected: boolean, reached?: boolean }}  connected=true only when a human engaged.
 */
async function pollCallOutcome(callId, noPickupReasons, treatErrorsAsNoPickup, requireConversation = false) {
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
      const pickedUp = isPickup(call, noPickupReasons, treatErrorsAsNoPickup);
      if (pickedUp && requireConversation && !hadMeaningfulConversation(call)) {
        console.log(`[reg-call] ended reason="${call.endedReason}" → picked up, no real conversation — keep calling`);
        return { connected: false, reached: true, endedReason: call.endedReason || "" };
      }
      console.log(`[reg-call] ended reason="${call.endedReason}" → connected=${pickedUp}`);
      return { connected: pickedUp, endedReason: call.endedReason || "" };
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
 * @param {number} [opts.maxCalls=2]               1 = single call, no 60s retry
 * @param {boolean} [opts.requireConversation=false] loops: only a real
 *   conversation counts as connected (see hadMeaningfulConversation)
 * @returns {{ connected: boolean, reached?: boolean }}
 */
async function runCallBurst(
  lead = {},
  { initialDelayMs = 0, noPickupReasons = RETRY_REASONS, treatErrorsAsNoPickup = false, maxCalls = 2, requireConversation = false } = {}
) {
  const who = lead.fullName || lead.phone || "lead";
  if (initialDelayMs > 0) await delay(initialDelayMs);

  // ── Attempt 1 ──────────────────────────────────────────────────────────
  const first = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 1 → ${who}:`, first);
  if (!first.success || !first.callId) return { connected: false };

  const firstOutcome = await pollCallOutcome(first.callId, noPickupReasons, treatErrorsAsNoPickup, requireConversation);
  if (firstOutcome.connected) {
    console.log(`[reg-call] ${who}: connected on attempt 1.`);
    return { connected: true };
  }
  // They answered but couldn't talk — don't ring straight back; the loop's
  // next slot tries again.
  if (firstOutcome.reached) return { connected: false, reached: true };
  if (maxCalls < 2) return { connected: false };

  // ── Attempt 2 (no pickup) — final call of this burst ───────────────────
  await delay(WAIT_MS);
  const second = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 2 (no-answer retry) → ${who}:`, second);
  if (!second.success || !second.callId) return { connected: false };

  const secondOutcome = await pollCallOutcome(second.callId, noPickupReasons, treatErrorsAsNoPickup, requireConversation);
  console.log(`[reg-call] ${who}: connected=${secondOutcome.connected} after burst.`);
  return { connected: secondOutcome.connected, reached: !!secondOutcome.reached };
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
  pollCallOutcome,
  hadMeaningfulConversation,
  RETRY_REASONS,
  DID_NOT_CONNECT_REASONS,
  WAIT_MS,
};
