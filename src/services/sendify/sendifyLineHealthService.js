// services/sendify/sendifyLineHealthService.js
//
// Auto-quarantine evaluation (sendify-infra.md §7.4). Two of the three
// documented triggers are implemented with a real, testable signal:
//   - consecutiveFailures >= 5 (tracked live on every send, in lineSendWorker)
//   - failureRateRecent > 30% over the last 50 send attempts (computed here
//     by querying recent sendifyMessage history — not tracked live)
// The third ("3+ carrier-block failure codes in 1 hour") is NOT implemented:
// no channel adapter we have (mock or BlueBubbles) currently classifies any
// error as carrier-block-specific — mapErrors.js has no such category, so
// there's no real signal to evaluate yet. Flagged here rather than faked
// with a rule that could never fire.
//
// A config/auth error quarantining immediately (no threshold) is handled
// separately, directly in lineSendWorker on a ChannelError kind:"config" —
// that one's a hard stop, not a rate-based judgment call.
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const SendifyMessage = require("../../model/sendify/sendifyMessageModel");
const SendifyLineEvent = require("../../model/sendify/sendifyLineEventModel");
const { notifySendifyAlert } = require("../shared/slackService");

const CONSECUTIVE_FAILURE_THRESHOLD = Number(process.env.SENDIFY_HEALTH_CONSECUTIVE_FAILURES || 5);
const FAILURE_RATE_WINDOW = Number(process.env.SENDIFY_HEALTH_FAILURE_RATE_WINDOW || 50);
const FAILURE_RATE_THRESHOLD = Number(process.env.SENDIFY_HEALTH_FAILURE_RATE_THRESHOLD || 0.3);

/** Recomputes failureRateRecent over the last FAILURE_RATE_WINDOW outbound attempts on this line. Doesn't quarantine by itself — callers check the returned value. */
async function computeFailureRateRecent(lineId) {
  const recent = await SendifyMessage.find({
    lineId,
    direction: "out",
    status: { $in: ["accepted", "sent", "delivered", "failed"] },
  })
    .sort({ updatedAt: -1 })
    .limit(FAILURE_RATE_WINDOW)
    .select("status");

  if (recent.length === 0) return 0;
  const failed = recent.filter((m) => m.status === "failed").length;
  return failed / recent.length;
}

/**
 * @param {object} line - a sendifyLineModel document
 * @param {string} [reason] - a specific reason already known (e.g. a config error) — skips the threshold checks and quarantines immediately
 * @returns {Promise<boolean>} true if the line was (just now) quarantined
 */
async function evaluateAndMaybeQuarantine(line, reason) {
  if (line.status === "quarantined" || line.status === "retired") return false;

  let quarantineReason = reason || null;

  if (!quarantineReason && (line.health?.consecutiveFailures || 0) >= CONSECUTIVE_FAILURE_THRESHOLD) {
    quarantineReason = `${line.health.consecutiveFailures} consecutive send failures`;
  }

  if (!quarantineReason) {
    const failureRate = await computeFailureRateRecent(line._id);
    line.health = line.health || {};
    line.health.failureRateRecent = failureRate;
    if (failureRate > FAILURE_RATE_THRESHOLD) {
      quarantineReason = `failure rate ${(failureRate * 100).toFixed(0)}% over last ${FAILURE_RATE_WINDOW} attempts`;
    }
  }

  if (!quarantineReason) return false;

  const fromStatus = line.status;
  line.status = "quarantined";
  line.statusReason = quarantineReason;
  line.statusChangedAt = new Date();
  line.statusChangedBy = { kind: "system" };
  await line.save();

  await SendifyLineEvent.create({
    lineId: line._id,
    type: "quarantine",
    from: fromStatus,
    to: "quarantined",
    reason: quarantineReason,
    actor: { kind: "system" },
  });

  await require("./sendifyLineDrainService").drainLine(line._id);

  notifySendifyAlert({
    level: "error",
    title: "Line quarantined",
    fields: [
      { label: "Line", value: line.name },
      { label: "Reason", value: quarantineReason },
    ],
  }).catch(() => {});

  return true;
}

module.exports = { evaluateAndMaybeQuarantine, computeFailureRateRecent, CONSECUTIVE_FAILURE_THRESHOLD, FAILURE_RATE_THRESHOLD };
