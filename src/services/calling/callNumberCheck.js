// services/calling/callNumberCheck.js
//
// Should Maya call this number at all? Checked in dispatchCall (vapiService.js), the one place every call goes
// through: sign-up lists, follow-ups, callbacks, Buyer Match, admin campaigns.
//   - a number that can't exist (free check, utils/phoneCheck.js): +1 498…, 555…, 123-456-7890
//   - a number Twilio told us doesn't exist when we texted it (Vtext contact phoneStatus "invalid": 21211, 30005)
//   - a dead number: DEAD_AFTER_FAILED_CONNECTS calls in a row never reached the phone network
//     ("twilio-failed-to-connect-call"). No calls for DEAD_DAYS, then it may be tried again.
// A landline is fine to call (only texts can't reach it).
//
// A refused call comes back from dispatchCall as { success: false, badNumber: true }, and each call list then
// ends calling for that lead (settleBurst) instead of booking tomorrow's call.
const PhoneDial = require("../../model/calling/phoneDialModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const { checkPhoneFormat } = require("../../utils/phoneCheck");
const { phoneKey } = require("./dailyDialGuard");
const { maskPhone } = require("../../utils/maskPii");

const DEAD_AFTER_FAILED_CONNECTS = 3;
const DEAD_DAYS = 30;

// The call never reached the phone network: the number is disconnected or not in service.
const NEVER_CONNECTED = new Set(["twilio-failed-to-connect-call"]);
// The phone rang (or answered): the number is alive. Errors on our side (pipeline-error, call-start-error …)
// say nothing about the number, so they neither count nor reset.
const REACHED_THE_PHONE = new Set([
  "voicemail",
  "customer-ended-call",
  "customer-busy",
  "customer-did-not-answer",
  "no-answer",
  "silence-timed-out",
  "assistant-ended-call",
  "assistant-said-end-call-phrase",
  "assistant-forwarded-call",
  "exceeded-max-duration",
]);

const REASON_TEXT = {
  "not-a-real-number": "not a real phone number",
  "number-does-not-exist": "Twilio says this number does not exist",
  "dead-number": `calls to this number never connect (${DEAD_AFTER_FAILED_CONNECTS} in a row)`,
};

/** "+14155550123" / "4155550123" → "+14155550123" */
const toE164 = (phone) => {
  const key = phoneKey(phone);
  return key ? `+${key}` : "";
};

/**
 * @param {string} phone any shape
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, message: string }>}  never throws
 */
async function checkCallNumber(phone, { now = new Date() } = {}) {
  const e164 = toE164(phone);
  const refuse = (reason) => ({ ok: false, reason, message: `bad number: ${REASON_TEXT[reason]}` });
  if (!e164 || !checkPhoneFormat(e164).valid) return refuse("not-a-real-number");
  try {
    const [contact, dial] = await Promise.all([
      VtextContact.findOne({ phoneE164: e164 }).select("phoneStatus").lean(),
      PhoneDial.findOne({ phone: phoneKey(phone) }).select("deadUntil").lean(),
    ]);
    if (contact?.phoneStatus === "invalid") return refuse("number-does-not-exist");
    if (dial?.deadUntil && new Date(dial.deadUntil) > now) return refuse("dead-number");
  } catch (err) {
    console.error("[call-number] check failed (calling anyway):", err.message); // a DB hiccup never blocks a call
  }
  return { ok: true };
}

/**
 * A call ended (Vapi end-of-call report): keep the dead-number count. Never throws.
 * @returns {Promise<"dead"|"counted"|"reset"|null>}
 */
async function recordCallEnded({ phone, endedReason, vapiCallId = "", now = new Date() }) {
  const key = phoneKey(phone);
  const reason = String(endedReason || "").toLowerCase();
  if (!key || (!NEVER_CONNECTED.has(reason) && !REACHED_THE_PHONE.has(reason))) return null;
  try {
    const notCountedYet = vapiCallId ? { lastResultCallId: { $ne: vapiCallId } } : {};
    if (REACHED_THE_PHONE.has(reason)) {
      await PhoneDial.updateOne(
        { phone: key, ...notCountedYet },
        { $set: { failedConnects: 0, deadUntil: null, lastResultCallId: vapiCallId } }
      );
      return "reset";
    }
    const row = await PhoneDial.findOneAndUpdate(
      { phone: key, ...notCountedYet },
      { $inc: { failedConnects: 1 }, $set: { lastResultCallId: vapiCallId } },
      { new: true }
    ).lean();
    if (!row) return null; // already counted, or never dialed through dispatchCall
    if (row.failedConnects >= DEAD_AFTER_FAILED_CONNECTS) {
      const deadUntil = new Date(now.getTime() + DEAD_DAYS * 86_400_000);
      await PhoneDial.updateOne({ phone: key }, { $set: { deadUntil } });
      console.warn(`[call-number] ${maskPhone(`+${key}`)} marked dead: ${row.failedConnects} calls in a row never connected. No calls for ${DEAD_DAYS} days.`);
      return "dead";
    }
    return "counted";
  } catch (err) {
    console.error("[call-number] couldn't record the call result:", err.message);
    return null;
  }
}

/**
 * Run by every call list right after a burst, before its own outcome step:
 *   - bad number → end calling for this lead (callStatus "not-reached", no next call), the attempt not counted.
 *                  Returns true: the list must skip its own outcome step.
 *   - not dialed → (already called today, no caller number left, Buyer Match running …) the attempt isn't
 *                  counted. Returns false: the list books the next call as before.
 *   - dialed     → nothing. Returns false.
 * Never throws.
 * @param {object} Model    the lead model (callStatus, nextCallAt, callAttempts)
 * @param {*} leadId
 * @param {object} result   the burst's result (runCallBurst / enqueueBurst)
 * @param {object} [opts]
 * @param {boolean} [opts.undoAttempt=true]  false for lists whose attempt count drives the schedule (Toorak)
 * @returns {Promise<boolean>} true when calling was stopped for a bad number
 */
async function settleNotDialed(Model, leadId, result, { undoAttempt = true } = {}) {
  try {
    if (result?.badNumber) {
      await Model.updateOne({ _id: leadId }, { $set: { callStatus: "not-reached", nextCallAt: null } });
      await Model.updateOne({ _id: leadId, callAttempts: { $gt: 0 } }, { $inc: { callAttempts: -1 } });
      console.warn(`[call-number] stopped calling lead ${leadId}: ${result.error || "bad number"}`);
      return true;
    }
    // suppressed = skipped because Buyer Match calls are running for the number (callDispatchQueue): not a call either.
    if ((result?.notDialed || result?.suppressed) && undoAttempt) {
      await Model.updateOne({ _id: leadId, callAttempts: { $gt: 0 } }, { $inc: { callAttempts: -1 } });
    }
  } catch (err) {
    console.error(`[call-number] couldn't settle lead ${leadId}:`, err.message);
  }
  return false;
}

module.exports = {
  checkCallNumber,
  recordCallEnded,
  settleNotDialed,
  DEAD_AFTER_FAILED_CONNECTS,
  DEAD_DAYS,
  NEVER_CONNECTED,
  REACHED_THE_PHONE,
};
