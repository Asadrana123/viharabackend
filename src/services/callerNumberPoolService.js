// services/callerNumberPoolService.js
const { DateTime } = require("luxon");
const CallerNumberUsage = require("../model/callerNumberUsageModel");

/**
 * Caller-ID rotation for outbound Maya calls.
 *
 * Goal: spread outbound calls across several VAPI numbers so no single number
 * gets flagged "Spam Likely" from over-dialing. Strategy = "least-used-today":
 * every call picks whichever pool number has placed the FEWEST calls so far
 * today, and never picks a number that has already hit the daily cap.
 *
 * All tunable via env (no redeploy needed to change them):
 *   VAPI_PHONE_NUMBER_IDS               Comma/pipe separated pool of VAPI phone
 *                                       number ids, e.g. "id_a,id_b,id_c".
 *                                       Falls back to the single legacy
 *                                       VAPI_PHONE_NUMBER_ID when unset, so
 *                                       existing behaviour is unchanged until
 *                                       you set the pool.
 *   VAPI_MAX_CALLS_PER_NUMBER_PER_DAY   Daily cap per number. Default 50.
 *   VAPI_POOL_TIMEZONE                  Timezone the "day" resets in.
 *                                       Default America/Los_Angeles.
 */

const CAP = Number(process.env.VAPI_MAX_CALLS_PER_NUMBER_PER_DAY || 50);
const POOL_TZ = process.env.VAPI_POOL_TIMEZONE || "America/Los_Angeles";

// Parse the pool from env. Accepts commas or pipes, trims blanks, de-dupes.
const getPool = () => {
  const raw = process.env.VAPI_PHONE_NUMBER_IDS || process.env.VAPI_PHONE_NUMBER_ID || "";
  const ids = raw
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ids)];
};

// Today's local calendar day in the pool timezone, as "YYYY-MM-DD".
const dayKey = () => DateTime.now().setZone(POOL_TZ).toFormat("yyyy-LL-dd");

/**
 * Pick the phone number id to dial from next, then atomically record the use.
 *
 * Returns the chosen phoneNumberId string, or null when every number in the
 * pool has already hit the daily cap (caller should skip the dial in that case).
 *
 * Non-fatal by design: if the usage lookup fails for any reason, we fall back
 * to the first pool number rather than blocking a call.
 */
const pickCallerNumberId = async () => {
  const pool = getPool();
  if (pool.length === 0) return null; // nothing configured
  if (pool.length === 1) {
    // Single number: still count it so the cap applies, but there's no choice.
    await bumpUsage(pool[0]).catch(() => {});
    return pool[0];
  }

  const day = dayKey();

  let counts = {};
  try {
    const rows = await CallerNumberUsage.find({ phoneNumberId: { $in: pool }, day }).lean();
    counts = rows.reduce((acc, r) => {
      acc[r.phoneNumberId] = r.count || 0;
      return acc;
    }, {});
  } catch (err) {
    console.error("[pool] usage lookup failed (non-fatal), using first number:", err.message);
    return pool[0];
  }

  // Numbers still under the cap, with their current count (missing = 0).
  const available = pool
    .map((id) => ({ id, count: counts[id] || 0 }))
    .filter((n) => n.count < CAP);

  if (available.length === 0) {
    console.warn(`[pool] all ${pool.length} numbers hit daily cap (${CAP}) for ${day} — skipping dial`);
    return null;
  }

  // Least-used first; random tie-break so equal numbers share load evenly.
  const min = Math.min(...available.map((n) => n.count));
  const leastUsed = available.filter((n) => n.count === min);
  const chosen = leastUsed[Math.floor(Math.random() * leastUsed.length)].id;

  await bumpUsage(chosen).catch((err) =>
    console.error("[pool] usage increment failed (non-fatal):", err.message)
  );

  console.log(`[pool] picked ${chosen} (used ${min}/${CAP} today, ${day})`);
  return chosen;
};

// Atomically +1 today's count for a number (creates the row on first use).
const bumpUsage = (phoneNumberId) =>
  CallerNumberUsage.updateOne(
    { phoneNumberId, day: dayKey() },
    { $inc: { count: 1 } },
    { upsert: true }
  );

module.exports = { pickCallerNumberId, getPool, dayKey, CAP, POOL_TZ };
