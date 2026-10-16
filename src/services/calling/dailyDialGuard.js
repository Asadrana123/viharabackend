// services/dailyDialGuard.js
//
// ONE call per phone number per day, across every system that dials
// (sign-up follow-ups, Buyer Match, admin campaigns, outbound, enrichment).
// Calling someone again and again when they don't pick up or are busy is what
// annoys people, so if the number was already dialed today (in the person's
// timezone) the next dial is skipped and the loop simply tries another day.
//
// Exempt (they dial even if we already called today — see dispatchCall's
// `oncePerDay` option): a callback the person asked for, a brand-new sign-up
// the person just submitted, and the admin "call one person" form. Those
// still RECORD the dial, so the automatic loops won't ring them again today.

const { DateTime } = require("luxon");
const PhoneDial = require("../../model/calling/phoneDialModel");

const DEFAULT_TZ = "America/New_York";
const ALREADY_CALLED_TODAY = "already called today";

/** "+1 (415) 555-0123" / "4155550123" → "14155550123". */
function phoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

/** Start of today in the person's timezone (Eastern when unknown/invalid). */
function startOfToday(timezone) {
  const local = DateTime.now().setZone(timezone || DEFAULT_TZ);
  return (local.isValid ? local : DateTime.now().setZone(DEFAULT_TZ)).startOf("day").toJSDate();
}

/**
 * Record a dial for this number, atomically.
 * @param {boolean} [opts.enforce=true]  false = record without checking (exempt calls)
 * @returns {Promise<{ allowed: boolean, release: () => Promise<void> }>}
 *   allowed=false → we already called this number today; don't dial.
 *   release()     → undo the record (call it when the dial didn't go out).
 */
async function claimDailyDial(phone, { timezone, source = "", enforce = true } = {}) {
  const key = phoneKey(phone);
  const noop = { allowed: true, release: async () => {} };
  if (!key) return noop;

  const now = new Date();
  const filter = enforce
    ? { phone: key, lastDialAt: { $lt: startOfToday(timezone) } }
    : { phone: key };

  let previous;
  try {
    // Returns the row as it was before (null when the number is new).
    previous = await PhoneDial.findOneAndUpdate(
      filter,
      { $set: { lastDialAt: now, source } },
      { upsert: true, new: false }
    ).lean();
  } catch (err) {
    // Duplicate key = the row exists but was dialed today → blocked.
    if (err && err.code === 11000) return { allowed: false, release: async () => {} };
    // Any other DB problem must never block a call.
    console.error("[daily-dial] guard lookup failed (non-fatal):", err.message);
    return noop;
  }

  const release = async () => {
    try {
      if (previous) {
        await PhoneDial.updateOne(
          { phone: key, lastDialAt: now },
          { $set: { lastDialAt: previous.lastDialAt, source: previous.source || "" } }
        );
      } else {
        await PhoneDial.deleteOne({ phone: key, lastDialAt: now });
      }
    } catch (err) {
      console.error("[daily-dial] release failed (non-fatal):", err.message);
    }
  };

  return { allowed: true, release };
}

module.exports = { claimDailyDial, phoneKey, ALREADY_CALLED_TODAY };
