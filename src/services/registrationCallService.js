// services/registrationCallService.js
//
// Orchestrates the registration-call flow for persona-1 leads:
//   wait 60s → call → if NOT answered → wait 60s → call once more.
// The second attempt exists to punch through Do-Not-Disturb, which
// commonly lets a second call from the same number ring through.
//
// Runs as a fire-and-forget background task. The backend is a long-lived
// Render process, so in-memory setTimeout timers are safe (same pattern as
// the in-memory campaign jobs / activeAuctions map).

const { dispatchRegistrationCall } = require("./leadCallService");
const { getCall } = require("./vapiService");

const WAIT_MS = 60 * 1000;        // 60s before the first call, and before the retry
const POLL_EVERY_MS = 10 * 1000;  // check call status every 10s
const POLL_MAX_MS = 5 * 60 * 1000; // give up polling after 5 min (assume answered)

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// endedReasons that mean the human never actually picked up → retry.
const NO_ANSWER_REASONS = new Set([
  "no-answer",
  "customer-did-not-answer",
  "customer-busy",
  "voicemail",
  "silence-timed-out",
  "twilio-failed-to-connect-call",
  "call-start-error",
  "pipeline-error",
]);

function isNoAnswer(call) {
  const reason = String(call?.endedReason || "").toLowerCase();
  if (NO_ANSWER_REASONS.has(reason)) return true;
  if (reason.includes("error") || reason.includes("failed")) return true;
  return false;
}

/**
 * Poll VAPI until the call ends (or we time out).
 * @returns {{answered: boolean}}  answered=false only when it clearly rang out.
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
      return { answered: !isNoAnswer(call) };
    }
  }

  // Still going after POLL_MAX_MS — they're almost certainly talking. No retry.
  return { answered: true };
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

  // Couldn't even place the call (bad number / VAPI reject) — nothing to poll.
  if (!first.success || !first.callId) return;

  const outcome = await pollCallOutcome(first.callId);
  if (outcome.answered) {
    console.log(`[reg-call] ${who} answered — no retry.`);
    return;
  }

  // ── Attempt 2 (after another 60s) — final ──────────────────────────────
  await delay(WAIT_MS);
  const second = await dispatchRegistrationCall(lead);
  console.log(`[reg-call] attempt 2 (DND bypass) → ${who}:`, second);
};

module.exports = { scheduleRegistrationCall };