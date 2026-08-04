// services/registrationCallService.js
//
// Registration-call flow for persona-1 leads. AT MOST two calls, ever:
//   wait 60s → call once, then:
//     • answered                    → stop (no retry)
//     • customer cut / declined     → stop (no retry)
//     • rang out / no answer        → wait 60s → call once more → stop
//
// The retry fires ONLY on a genuine no-answer, so a person who actively
// declines the first call is never called a second time. There is no third
// attempt under any outcome.
//
// Runs as a fire-and-forget background task. The backend is a long-lived
// Render process, so in-memory setTimeout timers are safe (same pattern as
// the in-memory campaign jobs / activeAuctions map).

const { dispatchRegistrationCall } = require("./leadCallService");
const { getCall } = require("./vapiService");

const WAIT_MS = 60 * 1000;         // 60s before the first call, and before the retry
const POLL_EVERY_MS = 10 * 1000;   // check call status every 10s
const POLL_MAX_MS = 5 * 60 * 1000; // give up polling after 5 min (assume answered)

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry ONLY on a genuine ring-out / no-answer. Every other ended reason —
// answered, customer-busy (declined), customer-ended-call, errors — means the
// person either picked up or actively cut the call, so we do NOT call again.
const RETRY_REASONS = new Set([
  "no-answer",
  "customer-did-not-answer",
  "silence-timed-out",
  "voicemail",
]);

function shouldRetry(call) {
  const reason = String(call?.endedReason || "").toLowerCase();
  return RETRY_REASONS.has(reason);
}

/**
 * Poll VAPI until the call ends (or we time out).
 * @returns {{ retry: boolean }}  retry=true only on a clear no-answer.
 */
async function pollCallOutcome(callId) {
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
      const retry = shouldRetry(call);
      console.log(`[reg-call] ended reason="${call.endedReason}" → retry=${retry}`);
      return { retry };
    }
  }

  // Still going after POLL_MAX_MS — they're almost certainly talking. No retry.
  return { retry: false };
}

/**
 * Schedule the whole flow for one lead. Fire-and-forget from the controller.
 */
const scheduleRegistrationCall = async (lead = {}) => {
  const who = lead.fullName || lead.phone || "lead";

  // ── Attempt 1 (after 60s) ──────────────────────────────────────────────
  await delay(WAIT_MS);
  const first = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 1 → ${who}:`, first);

  // Couldn't even place the call (bad number / VAPI reject) — nothing to poll,
  // and we do not retry.
  if (!first.success || !first.callId) return;

  const { retry } = await pollCallOutcome(first.callId);
  if (!retry) {
    console.log(`[reg-call] ${who}: no retry (answered or declined).`);
    return;
  }

  // ── Attempt 2 (after another 60s) — final. No third attempt ever. ──────
  await delay(WAIT_MS);
  const second = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 2 (no-answer retry) → ${who}:`, second);
};

module.exports = { scheduleRegistrationCall };
