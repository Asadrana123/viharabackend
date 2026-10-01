// services/sendify/sendifyCapacityService.js
//
// All three capacity gates from sendify-infra.md §4.4:
//   - daily cap (Mongo, atomic, cap-guarded $inc — survives Redis loss)
//   - reply reserve (cold sends capped lower than replies-to-inbound)
//   - new-recipient-per-hour (Redis ZSET, ephemeral by design — losing it on
//     a Redis flush just resets a 1-hour window, not a correctness issue)
const { DateTime } = require("luxon");
const SendifyLineUsage = require("../../model/sendify/sendifyLineUsageModel");
const { getRedisClient } = require("./queue/connection");
const { getAdapter } = require("./channels/registry");

const DAY_TZ = process.env.SENDIFY_DAY_TZ || "America/New_York";
const dayKey = (date = new Date()) => DateTime.fromJSDate(date).setZone(DAY_TZ).toFormat("yyyy-LL-dd");

function limitsFor(line) {
  const adapter = getAdapter(line.channelType);
  return { ...adapter.defaultLimits, ...stripNullish(line.limits) };
}

// line.limits fields are individually nullable (schema comment: "null fields
// -> adapter.defaultLimits") — strip them so the spread above doesn't let an
// explicit null/undefined override a real adapter default with nothing.
function stripNullish(obj) {
  if (!obj) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj.toObject ? obj.toObject() : obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/** Perday cap from the warm-up schedule for "days since warmup started", or the full limit if warmup is off/not started/complete. */
function warmupPerDay(line, limits) {
  if (!line.warmup?.enabled || !line.warmup?.startedAt) return limits.perDay;
  const daysSinceStart = Math.floor((Date.now() - new Date(line.warmup.startedAt).getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const schedule = line.warmup.schedule?.length ? line.warmup.schedule : limits.warmupSchedule;
  if (!schedule?.length) return limits.perDay;

  // schedule is a sorted list of {fromDay, perDay} — find the last entry whose fromDay <= today.
  let applicable = schedule[0];
  for (const step of schedule) {
    if (step.fromDay <= daysSinceStart) applicable = step;
  }
  return Math.min(applicable.perDay, limits.perDay);
}

// §7.4 soft throttle: a line replyRatio7d (set by the daily-rollover job,
// sendifyLineHealthService) below this, with at least this many sends in the
// trailing 7 days, halves the effective cap until the ratio recovers. The
// sent-count guard matters — a brand-new line with 3 sends and 0 replies
// isn't "bad," it just hasn't gotten any replies yet; this only fires once
// there's enough volume for a low ratio to actually mean something.
const THROTTLE_REPLY_RATIO = Number(process.env.SENDIFY_HEALTH_THROTTLE_REPLY_RATIO ?? 0.05);
const THROTTLE_MIN_SENDS_7D = Number(process.env.SENDIFY_HEALTH_THROTTLE_MIN_SENDS || 200);
const THROTTLE_MULTIPLIER = Number(process.env.SENDIFY_HEALTH_THROTTLE_MULTIPLIER || 0.5);

/** The real, computed cap for today — not stored, per sendify-infra.md §3.1. Automatically applies the §7.4 soft reply-ratio throttle from the line's own stored health fields. */
function effectiveDailyCap(line) {
  const limits = limitsFor(line);
  const warmupCap = warmupPerDay(line, limits);

  const sentLast7d = line.health?.sentLast7d ?? Infinity; // unknown (never rolled up) -> don't throttle on a guess
  const replyRatio7d = line.health?.replyRatio7d;
  const throttled = sentLast7d >= THROTTLE_MIN_SENDS_7D && typeof replyRatio7d === "number" && replyRatio7d < THROTTLE_REPLY_RATIO;

  return Math.max(0, Math.floor(warmupCap * (throttled ? THROTTLE_MULTIPLIER : 1)));
}

// Atomic check-and-add over a 1-hour sliding window, in one round trip so two
// concurrent reservations can't both read "under limit" and both write.
const NEW_RECIPIENT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return 1
`;

async function checkAndReserveNewRecipientSlot(lineId, limit) {
  const redis = getRedisClient();
  const key = `sendify:newrcpt:${lineId}`;
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`; // unique member per call so concurrent calls don't collide in the ZSET
  const result = await redis.eval(NEW_RECIPIENT_LUA, 1, key, now, 60 * 60 * 1000, limit, member);
  return result === 1;
}

/**
 * Reserves one send against a line's daily cap (and, if isNewRecipient,
 * against its new-recipient-per-hour budget). Returns {ok:true, day} on
 * success, or {ok:false, reason} when any gate is exhausted — caller
 * (routeWorker) treats a false result as "try another line or wait," not
 * an error.
 */
async function reserve(line, { isReply = false, isNewRecipient = false } = {}) {
  const limits = limitsFor(line);
  const cap = effectiveDailyCap(line);
  const coldCap = Math.floor(cap * (1 - (limits.replyReservePct || 0) / 100));
  const capToUse = isReply ? cap : coldCap;

  if (isNewRecipient) {
    const gotSlot = await checkAndReserveNewRecipientSlot(line._id, limits.newRecipientsPerHour);
    if (!gotSlot) {
      return { ok: false, reason: "new-recipient-per-hour limit reached" };
    }
  }

  const day = dayKey();
  // Ensure the day row exists first — can't combine upsert with a $lt filter
  // and get correct behavior for a brand-new row (sendify-infra.md §4.4).
  await SendifyLineUsage.updateOne(
    { lineId: line._id, day },
    { $setOnInsert: { lineId: line._id, day, assigned: 0, sent: 0, failed: 0, inbound: 0, newRecipients: 0, replyAssigned: 0 } },
    { upsert: true }
  );

  const updated = await SendifyLineUsage.findOneAndUpdate(
    { lineId: line._id, day, assigned: { $lt: capToUse } },
    { $inc: { assigned: 1, replyAssigned: isReply ? 1 : 0, newRecipients: isNewRecipient ? 1 : 0 } },
    { new: true }
  );

  if (!updated) {
    return { ok: false, reason: isReply ? "daily cap reached" : "cold-send cap reached (reply reserve exhausted)" };
  }

  return { ok: true, day };
}

/** Gives back a reservation — a message that was assigned but then couldn't actually send (line went bad, contact opted out between route and send, etc). */
async function release(line, day, { wasReply = false } = {}) {
  await SendifyLineUsage.updateOne(
    { lineId: line._id, day },
    { $inc: { assigned: -1, replyAssigned: wasReply ? -1 : 0 } }
  );
}

async function recordSent(line, day) {
  await SendifyLineUsage.updateOne({ lineId: line._id, day }, { $inc: { sent: 1 } });
}

async function recordFailed(line, day) {
  await SendifyLineUsage.updateOne({ lineId: line._id, day }, { $inc: { failed: 1 } });
}

/** An inbound reply arrived on this line — feeds the reply-ratio health metric (Phase 4). Always today's day (inbound never reserves capacity, so there's no reservation day to pass). */
async function recordInbound(line) {
  await SendifyLineUsage.updateOne({ lineId: line._id, day: dayKey() }, { $inc: { inbound: 1 } }, { upsert: true });
}

async function remainingToday(line) {
  const cap = effectiveDailyCap(line);
  const day = dayKey();
  const usage = await SendifyLineUsage.findOne({ lineId: line._id, day });
  return Math.max(0, cap - (usage?.assigned || 0));
}

/** Like remainingToday, but against the cold-send cap when isReply is false (§7.2/§7.4) — a reply can still go out even when a cold send couldn't. */
async function remainingForSend(line, { isReply = false } = {}) {
  const limits = limitsFor(line);
  const cap = effectiveDailyCap(line);
  const capToUse = isReply ? cap : Math.floor(cap * (1 - (limits.replyReservePct || 0) / 100));
  const day = dayKey();
  const usage = await SendifyLineUsage.findOne({ lineId: line._id, day });
  return Math.max(0, capToUse - (usage?.assigned || 0));
}

/** Non-consuming peek at a line's current new-recipient-this-hour count — for eligibility checks during line SELECTION, where reserving a slot speculatively (before a line is actually chosen) would waste it. */
async function peekNewRecipientCount(lineId) {
  const redis = getRedisClient();
  const key = `sendify:newrcpt:${lineId}`;
  const now = Date.now();
  await redis.zremrangebyscore(key, 0, now - 60 * 60 * 1000);
  return redis.zcard(key);
}

module.exports = {
  dayKey,
  limitsFor,
  effectiveDailyCap,
  reserve,
  release,
  recordSent,
  recordFailed,
  recordInbound,
  remainingToday,
  remainingForSend,
  peekNewRecipientCount,
};
