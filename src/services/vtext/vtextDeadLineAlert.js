// services/vtext/vtextDeadLineAlert.js
//
// 🔴 when an iMessage line keeps sending but nothing it sends is delivered. That is how the Mac Mini line failed
// from 2026-11-05 to 2026-11-09 with nobody noticing: BlueBubbles answered and the line stayed "active", while
// every send failed with error 22 or got no receipt (Apple refusing the account's lookups, and dasd freezing
// Messages). Per-text alerts can't show it: each failure looks like "this lead isn't on iMessage", and US leads
// get the SMS copy so nothing looks lost.
//
// Rule (every 30 minutes, iMessage lines that can send):
//   at least VTEXT_DEAD_LINE_MIN_SENDS (5) sends attempted in the last VTEXT_DEAD_LINE_HOURS (6) hours,
//   and none of them delivered → one alert, then at most one more every 6 hours while it lasts;
//   the first delivery after an alert → 🟢 "delivering again".
// Texts sent in the last 15 minutes are left out (their receipt may still come). Inbound replies are not used:
// leads not replying proves nothing.
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const { sendAlertWithCooldown, getAlertWatermark, setAlertWatermark, adminTabUrl } = require("./vtextAlertService");

const IMESSAGE = "imessage-bluebubbles";
const MINUTE = 60_000;
const windowHours = () => Number(process.env.VTEXT_DEAD_LINE_HOURS || 6);
const minSends = () => Number(process.env.VTEXT_DEAD_LINE_MIN_SENDS || 5);
const SETTLE_MS = 15 * MINUTE;

const keyFor = (line) => `deadLine-${line._id}`;

/** Sends attempted on a line in the window, and how many were delivered. */
async function lineStats(line, now) {
  const from = new Date(now.getTime() - windowHours() * 60 * MINUTE);
  const to = new Date(now.getTime() - SETTLE_MS);
  const attempts = await VtextMessage.find({
    lineId: line._id,
    direction: "out",
    $or: [{ sentAt: { $gte: from, $lte: to } }, { failedAt: { $gte: from, $lte: to } }],
  })
    .select("status deliveredAt error.code")
    .lean();
  const delivered = attempts.filter((m) => m.deliveredAt || ["delivered", "read"].includes(m.status)).length;
  const errors = {};
  for (const m of attempts) {
    if (m.deliveredAt || ["delivered", "read"].includes(m.status)) continue;
    const code = m.error?.code === "22" ? "not delivered (error 22)" : m.error?.code === "no-receipt" ? "no receipt" : m.error?.code || m.status;
    errors[code] = (errors[code] || 0) + 1;
  }
  return { attempts: attempts.length, delivered, errors };
}

async function lastDeliveredAt(line) {
  const m = await VtextMessage.findOne({ lineId: line._id, direction: "out", deliveredAt: { $exists: true } })
    .sort({ deliveredAt: -1 })
    .select("deliveredAt")
    .lean();
  return m?.deliveredAt || null;
}

const ago = (date, now) => {
  if (!date) return "never on record";
  const min = Math.round((now - new Date(date)) / MINUTE);
  if (min < 120) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} hours ago`;
  return `${Math.round(min / 1440)} days ago`;
};

/**
 * @param {object} [deps] - test hooks: now(), lines, notify()
 * @returns {Promise<Array<{line: string, state: "dead"|"recovered"|"ok"|"too-few"}>>}
 */
async function runDeadLineCheck(deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const lines = deps.lines || (await VtextLine.find({ channelType: IMESSAGE, status: { $in: VtextLine.ROUTABLE_STATUSES } }).lean());
  const out = [];

  for (const line of lines) {
    const alertedAt = await getAlertWatermark(keyFor(line));
    const stats = await lineStats(line, now);

    if (stats.delivered > 0 || (alertedAt && (await lastDeliveredAt(line)) > alertedAt)) {
      if (alertedAt) {
        await setAlertWatermark(keyFor(line), null);
        await (deps.notify || require("../shared/slackService").notifyVtextAlert)({
          level: "info",
          icon: "🟢",
          title: `iMessage line delivering again: ${line.name}`,
          fields: [
            { label: "Line", value: line.name },
            { label: "Was not delivering since", value: `the alert ${ago(alertedAt, now)}` },
            { label: "What to do", value: "If SMS only is ON in Vtext Settings, you can turn it off again.", wide: true },
          ],
        }).catch(() => {});
        out.push({ line: line.name, state: "recovered" });
      } else {
        out.push({ line: line.name, state: "ok" });
      }
      continue;
    }
    if (stats.attempts < minSends()) {
      out.push({ line: line.name, state: "too-few" });
      continue;
    }

    const last = await lastDeliveredAt(line);
    const posted = await sendAlertWithCooldown(`${keyFor(line)}-alert`, 6 * 60 * MINUTE, {
      level: "error",
      icon: "🔴",
      title: `iMessage line not delivering: ${line.name}`,
      fields: [
        { label: "Line", value: line.name },
        { label: "Last delivered text", value: ago(last, now) },
        { label: `Sent in the last ${windowHours()} hours`, value: `${stats.attempts}, none delivered` },
        { label: "How they failed", value: Object.entries(stats.errors).map(([k, n]) => `${k}: ${n}`).join(", "), wide: true },
        {
          label: "What it means",
          value: "US leads still get the SMS copy, but nothing is going out by iMessage. Usually Messages on the Mac is stuck (dasd), or Apple is restricting the account after too many texts to new numbers.",
          wide: true,
        },
        {
          label: "What to do",
          value: `1. On the Mac Mini: \`sudo killall dasd\`, then quit and reopen Messages and BlueBubbles. 2. Send one test to a team iPhone. 3. Still failing: turn on SMS only in <${adminTabUrl("settings")}|Vtext → Settings> so the account rests.`,
          wide: true,
        },
      ],
    }, deps.notify ? { notify: deps.notify } : {});
    if (posted && !alertedAt) await setAlertWatermark(keyFor(line), now);
    out.push({ line: line.name, state: "dead" });
  }
  return out;
}

module.exports = { runDeadLineCheck, lineStats };
