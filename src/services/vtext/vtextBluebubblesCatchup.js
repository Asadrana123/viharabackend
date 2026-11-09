// services/vtext/vtextBluebubblesCatchup.js
//
// Asks the Mac directly for what its webhook may not have told us. BlueBubbles pushes receipts and replies to our
// webhook once; if that push is lost (ngrok drops, the backend is redeploying, BlueBubbles stalls on macOS 27's
// dasd bug) we never hear about it. This reads the Mac's Messages database through BlueBubbles' REST API and
// feeds anything we missed through the same handlers the webhook uses:
//   - a delivered / read / not-delivered status we do not have yet (handleMessageStatus: monotonic, runs the SMS
//     fallback logic, so a late "delivered" also cancels a fallback that has not gone out);
//   - a reply we never received (handleMessageReceived: dedupes on the BlueBubbles guid, then saves it, runs the
//     STOP/HELP keywords and the AI reply exactly as a live reply would).
//
// Two runs share this code (maintenanceWorker.js):
//   - "bluebubbles-catchup", every 10 minutes: statuses AND replies since the last successful run (a watermark,
//     with a 10-minute overlap, never more than 24 hours back).
//   - "bluebubbles-read-recheck", every 2 hours: statuses only, for texts from the last 48 hours, because a read
//     receipt can come hours after the text and only one push is ever made for it.
// Each run is ONE request per line (plus paging), not one per text: the Mac sits behind ngrok's free plan, which
// has a monthly request limit.
//
// Messages from the last 2 minutes are left alone, so a webhook that is simply on its way is not raced.
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const { getAdapter } = require("./channels/registry");
const { getAlertWatermark, setAlertWatermark } = require("./vtextAlertService");

const CHANNEL = "imessage-bluebubbles";
const MINUTE = 60_000;
const SETTLE_MS = 2 * MINUTE; // webhook still on its way
const OVERLAP_MS = 10 * MINUTE;
const MAX_LOOKBACK_MS = 24 * 60 * MINUTE;
const FIRST_RUN_LOOKBACK_MS = 30 * MINUTE;
const WATERMARK_KEY = "bbCatchupAt";
// Lines that can still receive replies: everything except ones not set up yet or retired.
const LISTENING_STATUSES = ["warming", "active", "paused", "offline", "quarantined"];

/** True when the Mac's status for our text is ahead of what we have stored. */
function isNews(stored, event) {
  if (event.status === "read") return stored.status !== "read";
  if (event.status === "delivered") return !["delivered", "read"].includes(stored.status);
  if (event.status === "failed") return !["failed", "delivered", "read", "cancelled"].includes(stored.status);
  return false;
}

/**
 * Catch one line up for messages created in [after, before].
 * @returns {Promise<{ statuses: object[], replies: object[] }>} what was missed and has now been applied
 */
async function catchUpLine(line, { after, before, includeReplies, deps = {} }) {
  const adapter = deps.adapter || getAdapter(line.channelType);
  const { handleMessageStatus, handleMessageReceived } = deps.handlers || require("./workers/inboundWorker");

  const events = await adapter.fetchRecentEvents({ line, after: after.getTime(), before: before.getTime() });
  const statuses = [];
  const replies = [];

  const statusEvents = events.filter((e) => e.type === "message.status" && e.providerMessageId);
  if (statusEvents.length) {
    const stored = await VtextMessage.find({
      channelType: line.channelType,
      direction: "out",
      "provider.messageId": { $in: statusEvents.map((e) => e.providerMessageId) },
    })
      .select("status provider.messageId")
      .lean();
    const byId = new Map(stored.map((m) => [m.provider.messageId, m]));
    for (const event of statusEvents) {
      const mine = byId.get(event.providerMessageId);
      if (!mine || !isNews(mine, event)) continue;
      try {
        await handleMessageStatus(event, line);
        statuses.push({ messageId: mine._id, from: mine.status, to: event.status });
      } catch (err) {
        console.error(`[vtext bb-catchup] could not apply ${event.status} to ${mine._id}:`, err.message);
      }
    }
  }

  if (includeReplies) {
    const received = events.filter((e) => e.type === "message.received" && e.providerMessageId);
    if (received.length) {
      const known = new Set(
        await VtextMessage.find({ channelType: line.channelType, "provider.messageId": { $in: received.map((e) => e.providerMessageId) } }).distinct("provider.messageId")
      );
      for (const event of received) {
        if (known.has(event.providerMessageId)) continue;
        try {
          await handleMessageReceived(event, line); // dedupes again inside, and a unique index backs it up
          replies.push({ from: event.from, body: event.body, at: event.receivedAt });
        } catch (err) {
          if (err?.code !== 11000) console.error(`[vtext bb-catchup] could not save a missed reply ${event.providerMessageId}:`, err.message);
        }
      }
    }
  }

  return { statuses, replies };
}

async function listeningLines(deps) {
  if (deps.lines) return deps.lines;
  return VtextLine.find({ channelType: CHANNEL, status: { $in: LISTENING_STATUSES } }).select("+credentials.iv +credentials.tag +credentials.ciphertext");
}

/** Tells the team when replies had been missed: that is the sign of BlueBubbles stalling on the Mac. Never throws. */
async function alertMissedReplies(line, replies, notify) {
  try {
    const VtextContact = require("../../model/vtext/vtextContactModel");
    const phones = [...new Set(replies.map((r) => r.from).filter(Boolean))];
    const contacts = await VtextContact.find({ phoneE164: { $in: phones } }).select("name phoneE164").lean();
    const nameOf = new Map(contacts.map((c) => [c.phoneE164, c.name]));
    const list = replies
      .slice(0, 8)
      .map((r) => `• ${nameOf.get(r.from) || r.from || "unknown"}: ${String(r.body || "(no text)").slice(0, 80)}`)
      .join("\n");
    await (notify || require("../shared/slackService").notifyVtextAlert)({
      level: "warning",
      icon: "⚠️",
      title: `Missed ${replies.length} repl${replies.length === 1 ? "y" : "ies"}, caught up now`,
      fields: [
        { label: "Line", value: line.name },
        { label: "What happened", value: "These replies were on the Mac but never reached us. They are in the Inbox now, and were handled like any reply (STOP, AI reply).", wide: true },
        { label: "Replies", value: list + (replies.length > 8 ? `\n…and ${replies.length - 8} more` : ""), wide: true },
        { label: "If this keeps happening", value: "BlueBubbles may be stalling on the Mac Mini. Run `sudo killall dasd` there, or restart BlueBubbles.", wide: true },
      ],
    });
  } catch (err) {
    console.error("[vtext bb-catchup] could not send the missed-replies alert:", err.message);
  }
}

/**
 * The 10-minute run: statuses and replies since the last successful run.
 * The watermark only moves when every line answered, so a Mac that was unreachable is caught up later.
 */
async function runCatchup(deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const before = new Date(now.getTime() - SETTLE_MS);
  const last = deps.watermark !== undefined ? deps.watermark : await getAlertWatermark(WATERMARK_KEY);
  const after = new Date(Math.max(
    now.getTime() - MAX_LOOKBACK_MS,
    last ? last.getTime() - OVERLAP_MS : now.getTime() - FIRST_RUN_LOOKBACK_MS
  ));

  const summary = { statuses: 0, replies: 0, failedLines: [] };
  for (const line of await listeningLines(deps)) {
    try {
      const result = await catchUpLine(line, { after, before, includeReplies: true, deps });
      summary.statuses += result.statuses.length;
      summary.replies += result.replies.length;
      if (result.replies.length) await alertMissedReplies(line, result.replies, deps.notify);
    } catch (err) {
      summary.failedLines.push(line.name);
      console.warn(`[vtext bb-catchup] could not reach ${line.name}:`, err.message);
    }
  }
  if (!summary.failedLines.length) await (deps.setWatermark || setAlertWatermark)(WATERMARK_KEY, before);
  if (summary.statuses || summary.replies) {
    console.log(`[vtext bb-catchup] caught up ${summary.statuses} status(es) and ${summary.replies} missed repl(ies)`);
  }
  return summary;
}

/** The 2-hour run: statuses only (late read receipts mostly) for texts from the last `hours` hours. */
async function runReadRecheck(deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const hours = Number(deps.hours || process.env.VTEXT_READ_RECHECK_HOURS || 48);
  const after = new Date(now.getTime() - hours * 60 * MINUTE);
  const before = new Date(now.getTime() - SETTLE_MS);
  const summary = { statuses: [], failedLines: [] };
  for (const line of await listeningLines(deps)) {
    try {
      const result = await catchUpLine(line, { after, before, includeReplies: false, deps });
      summary.statuses.push(...result.statuses);
    } catch (err) {
      summary.failedLines.push(line.name);
      console.warn(`[vtext read-recheck] could not reach ${line.name}:`, err.message);
    }
  }
  if (summary.statuses.length) console.log(`[vtext read-recheck] updated ${summary.statuses.length} text(s) from the Mac`);
  return summary;
}

/**
 * Asks the Mac about ONE text before it is given up on as "no receipt" (the 10-minute sweep).
 * Returns true when the Mac had a status for it (delivered / read / failed) and it was applied, so the
 * sweep must leave it alone. Any problem reaching the Mac returns false: the sweep then goes ahead as before.
 */
async function confirmBeforeGivingUp(message, deps = {}) {
  try {
    if (!message.provider?.messageId || !message.lineId) return false;
    const line = deps.line || (await VtextLine.findById(message.lineId).select("+credentials.iv +credentials.tag +credentials.ciphertext"));
    if (!line || line.channelType !== CHANNEL) return false;
    const adapter = deps.adapter || getAdapter(line.channelType);
    const [event] = await adapter.fetchMessageStatus({ line, providerMessageId: message.provider.messageId });
    if (!event || !isNews({ status: "accepted" }, event)) return false;
    const { handleMessageStatus } = deps.handlers || require("./workers/inboundWorker");
    await handleMessageStatus(event, line);
    return true;
  } catch (err) {
    console.warn(`[vtext stuck-sweep] could not ask the Mac about ${message._id}:`, err.message);
    return false;
  }
}

module.exports = { runCatchup, runReadRecheck, catchUpLine, confirmBeforeGivingUp, isNews, WATERMARK_KEY };
