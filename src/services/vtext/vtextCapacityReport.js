// services/vtext/vtextCapacityReport.js
//
// How many texts the Vtext lines can still send today, per line and in total, and the last 30 days. For the
// admin's Vtext page (capacity strip, Lines tab, line detail). Read only: the caps come from
// vtextCapacityService (warm-up, the low-reply slow-down, the reply reserve) and the counts from the
// per-line, per-day usage rows.
//
//   limit       today's cap (warm-up step or the full limit, halved while the reply rate is low)
//   coldLimit   the part new texts may use; the rest (replyReservePct, 15% for iMessage) is kept for replies
//   used        texts reserved today (sent, being sent, or failed after reserving); what the limit counts
//   leftNew     what new texts can still use today
//   leftReplies what is kept on top of leftNew for answering people who texted in
//
// Only lines that can send right now count in the totals: status "warming" or "active". Others are listed with
// the reason and zeros. Days run midnight to midnight in VTEXT_DAY_TZ (New York).
const { DateTime } = require("luxon");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextLineUsage = require("../../model/vtext/vtextLineUsageModel");
const capacity = require("./vtextCapacityService");

const { ROUTABLE_STATUSES } = VtextLine;
const HISTORY_DAYS = 30;

const STATUS_REASONS = {
  provisioning: "Not set up yet: sends nothing",
  paused: "Paused: sends nothing",
  offline: "Offline: sends nothing",
  quarantined: "Quarantined: sends nothing",
  retired: "Retired: sends nothing",
};

/** Why the line has the limit it has, in plain words. */
function reasonFor(line, { canSend, warmup, throttled, fullLimit }) {
  if (!canSend) return STATUS_REASONS[line.status] || `${line.status}: sends nothing`;
  const parts = [];
  if (warmup && warmup.day < warmup.lastStepDay) parts.push(`Warm-up day ${warmup.day} of ${warmup.lastStepDay} (full limit ${fullLimit})`);
  else if (warmup && warmup.perDay < fullLimit) parts.push(`Its warm-up schedule stops at ${warmup.perDay} a day (full limit ${fullLimit})`);
  else parts.push("Full limit");
  if (throttled) parts.push("halved: reply rate under 5% this week");
  if (line.routing?.acceptsNewContacts === false) parts.push("drain mode: only people it already texts");
  return parts.join(" · ");
}

/**
 * One line's capacity today. Pure.
 * @param {object} line - VtextLine doc
 * @param {object|null} usage - today's VtextLineUsage row
 * @param {object} [opts] - { newRecipientsThisHour: number|null, now: Date }
 */
function lineCapacity(line, usage, { newRecipientsThisHour = null, now = new Date() } = {}) {
  const limits = capacity.limitsFor(line);
  const canSend = ROUTABLE_STATUSES.includes(line.status);
  const warmup = capacity.warmupStep(line, limits, now);
  const throttled = capacity.isThrottled(line);
  const limit = canSend ? capacity.effectiveDailyCap(line, now) : 0; // same `now` as the warm-up step above
  const coldLimit = canSend ? capacity.coldCapOf(limit, limits) : 0;
  const used = usage?.assigned || 0;
  const leftNew = Math.max(0, coldLimit - used);
  const leftAll = Math.max(0, limit - used);
  return {
    lineId: line._id,
    name: line.name,
    channelType: line.channelType,
    status: line.status,
    canSend,
    reason: reasonFor(line, { canSend, warmup, throttled, fullLimit: limits.perDay }),
    fullLimit: limits.perDay,
    warmup: warmup && warmup.day < warmup.lastStepDay ? { day: warmup.day, of: warmup.lastStepDay } : null,
    throttled: canSend && throttled,
    limit,
    coldLimit,
    replyReservePct: limits.replyReservePct || 0,
    used,
    sent: usage?.sent || 0,
    failed: usage?.failed || 0,
    replies: usage?.inbound || 0,
    leftNew,
    leftReplies: leftAll - leftNew,
    newRecipientsPerHour: limits.newRecipientsPerHour,
    newRecipientsThisHour,
    perMinute: limits.perMinute,
  };
}

/** Totals over the lines that can send right now. Pure. */
function totalsOf(lines) {
  const sending = lines.filter((l) => l.canSend);
  const sum = (key) => sending.reduce((n, l) => n + (l[key] || 0), 0);
  return {
    linesSending: sending.length,
    linesNotSending: lines.length - sending.length,
    limit: sum("limit"),
    coldLimit: sum("coldLimit"),
    used: sum("used"),
    sent: sum("sent"),
    failed: sum("failed"),
    replies: sum("replies"),
    leftNew: sum("leftNew"),
    leftReplies: sum("leftReplies"),
  };
}

/** When today ends (midnight in VTEXT_DAY_TZ). */
const resetsAt = (now = new Date()) => DateTime.fromJSDate(now).setZone(capacity.DAY_TZ).plus({ days: 1 }).startOf("day").toJSDate();

/** The last `days` day keys, oldest first, ending today. */
function lastDays(days, now = new Date()) {
  const today = DateTime.fromJSDate(now).setZone(capacity.DAY_TZ).startOf("day");
  return Array.from({ length: days }, (_, i) => today.minus({ days: days - 1 - i }).toFormat("yyyy-LL-dd"));
}

/**
 * A line's limit on a past day. The saved cap when the day had a send; otherwise worked out from the warm-up
 * schedule (estimated: whether the line was slowed down that day isn't known, and its status then isn't either).
 */
function limitOn(line, day, usage) {
  if (typeof usage?.cap === "number") return { limit: usage.cap, estimated: false };
  if (line.createdAt && day < DateTime.fromJSDate(new Date(line.createdAt)).setZone(capacity.DAY_TZ).toFormat("yyyy-LL-dd")) {
    return { limit: 0, estimated: false }; // the line didn't exist yet
  }
  const limits = capacity.limitsFor(line);
  const noon = DateTime.fromISO(day, { zone: capacity.DAY_TZ }).set({ hour: 12 }).toJSDate();
  return { limit: capacity.warmupStep(line, limits, noon)?.perDay ?? limits.perDay, estimated: true };
}

/**
 * Day by day, oldest first: per line and in total. Pure.
 * @returns {{ day, limit, used, sent, failed, replies, estimated, lines: object[] }[]}
 */
function historyOf(lines, usageRows, days = HISTORY_DAYS, now = new Date()) {
  const byKey = new Map(usageRows.map((u) => [`${u.lineId}:${u.day}`, u]));
  return lastDays(days, now).map((day) => {
    const perLine = lines.map((line) => {
      const u = byKey.get(`${line._id}:${day}`);
      const { limit, estimated } = limitOn(line, day, u);
      return { lineId: line._id, name: line.name, limit, estimated, used: u?.assigned || 0, sent: u?.sent || 0, failed: u?.failed || 0, replies: u?.inbound || 0 };
    });
    const sum = (key) => perLine.reduce((n, l) => n + l[key], 0);
    return {
      day,
      limit: sum("limit"),
      used: sum("used"),
      sent: sum("sent"),
      failed: sum("failed"),
      replies: sum("replies"),
      estimated: perLine.some((l) => l.estimated && l.limit > 0),
      lines: perLine,
    };
  });
}

/** Today's capacity: every non-retired line plus totals over the ones that can send. */
async function getCapacityReport({ now = new Date() } = {}) {
  const day = capacity.dayKey(now);
  const lines = await VtextLine.find({ status: { $ne: "retired" } }).sort({ createdAt: 1 }).lean();
  const usageRows = await VtextLineUsage.find({ lineId: { $in: lines.map((l) => l._id) }, day }).lean();
  const usageByLine = new Map(usageRows.map((u) => [String(u.lineId), u]));
  const report = await Promise.all(
    lines.map(async (line) => {
      // Redis can be down; the hourly count is then unknown rather than an error.
      const newRecipientsThisHour = await capacity.peekNewRecipientCount(line._id).catch(() => null);
      return lineCapacity(line, usageByLine.get(String(line._id)), { newRecipientsThisHour, now });
    })
  );
  // Lines that can send first, then the rest (shown greyed out).
  report.sort((a, b) => Number(b.canSend) - Number(a.canSend));
  return { day, resetsAt: resetsAt(now), timezone: capacity.DAY_TZ, totals: totalsOf(report), lines: report };
}

/** The last `days` days (max 90), per line and in total. */
async function getCapacityHistory({ days = HISTORY_DAYS, now = new Date() } = {}) {
  const n = Math.min(90, Math.max(1, Number(days) || HISTORY_DAYS));
  const keys = lastDays(n, now);
  const lines = await VtextLine.find({ status: { $ne: "retired" } }).sort({ createdAt: 1 }).lean();
  const usageRows = await VtextLineUsage.find({ lineId: { $in: lines.map((l) => l._id) }, day: { $gte: keys[0] } }).lean();
  return { days: historyOf(lines, usageRows, n, now) };
}

module.exports = { HISTORY_DAYS, lineCapacity, totalsOf, historyOf, lastDays, resetsAt, getCapacityReport, getCapacityHistory };
