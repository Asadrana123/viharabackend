// services/calling/facetime/facetimeSweep.js
//
// Every 20 seconds, catches what the Mac agent didn't report:
//   - a job no Mac picked up, or one that never started ringing → phone call instead
//   - a call left "ringing" → no answer
//   - an answered call never reported as finished → ended
//   - a Mac that stopped checking in → one Slack alert (and it gets no new calls,
//     since facetimeRouter only picks Macs with a fresh check-in)
// Only started when FACETIME_ENABLED=true (index.js).
const FacetimeCallJob = require("../../../model/calling/facetimeCallJobModel");
const VtextLine = require("../../../model/vtext/vtextLineModel");
const { fallbackToPhone, alert } = require("./facetimeCallService");

const SWEEP_EVERY_MS = 20 * 1000;
const PICKUP_TIMEOUT_MS = 60 * 1000;   // queued/claimed this long without dialing → the Mac isn't doing it
const RING_START_TIMEOUT_MS = 45 * 1000; // dialing this long without ringing → it never rang
const RING_TIMEOUT_MS = 90 * 1000;     // ringing this long → nobody answered
const ANSWERED_TIMEOUT_MS = 30 * 60 * 1000;
const OFFLINE_AFTER_MS = 2 * 60 * 1000;

const ago = (ms) => new Date(Date.now() - ms);

async function closeStale(status, timeField, timeoutMs, to, note) {
  const stale = await FacetimeCallJob.find({ status, [timeField]: { $lt: ago(timeoutMs) } }).select("_id").lean();
  for (const { _id } of stale) {
    await FacetimeCallJob.updateOne(
      { _id, status },
      { $set: { status: to, finishedAt: new Date() }, $push: { events: { status: to, at: new Date(), note } } }
    );
  }
}

async function sweepJobs() {
  const neverStarted = await FacetimeCallJob.find({
    $or: [
      { status: { $in: ["queued", "claimed"] }, queuedAt: { $lt: ago(PICKUP_TIMEOUT_MS) } },
      { status: "dialing", dialingAt: { $lt: ago(RING_START_TIMEOUT_MS) } },
    ],
  })
    .select("_id status")
    .lean();
  for (const job of neverStarted) {
    await fallbackToPhone(job._id, job.status === "dialing" ? "Mac dialed but it never rang" : "no Mac started the call within 60 seconds");
  }

  await closeStale("ringing", "ringingAt", RING_TIMEOUT_MS, "no-answer", "rang with no answer and no report from the Mac");
  await closeStale("answered", "answeredAt", ANSWERED_TIMEOUT_MS, "ended", "the Mac never reported the end of the call");
}

async function sweepLines() {
  const quiet = await VtextLine.find({
    "facetime.enabled": true,
    "facetime.offlineAlertedAt": null,
    "facetime.lastHeartbeatAt": { $lt: ago(OFFLINE_AFTER_MS) },
  })
    .select("name facetime")
    .lean();
  for (const line of quiet) {
    const won = await VtextLine.updateOne(
      { _id: line._id, "facetime.offlineAlertedAt": null },
      { $set: { "facetime.offlineAlertedAt": new Date() } }
    );
    if (!won.modifiedCount) continue; // another server copy already alerted
    await alert("warning", "Mac stopped checking in", [
      { label: "Mac", value: line.name },
      { label: "Last check-in", value: line.facetime.lastHeartbeatAt ? new Date(line.facetime.lastHeartbeatAt).toISOString() : "never" },
      { label: "What happens now", value: "No FaceTime calls go to this Mac; they go out as normal phone calls. Check the Mac is awake and the agent is running." },
    ]);
  }
}

let running = false;
async function sweepOnce() {
  if (running) return;
  running = true;
  try {
    await sweepJobs();
    await sweepLines();
  } catch (err) {
    console.error("[facetime] sweep failed (non-fatal):", err.message);
  } finally {
    running = false;
  }
}

function startFacetimeSweep() {
  if (process.env.FACETIME_ENABLED !== "true") return;
  setInterval(sweepOnce, SWEEP_EVERY_MS);
  console.log("[facetime] FaceTime test is enabled on this server; sweep running every 20s");
}

module.exports = { startFacetimeSweep, sweepOnce };
