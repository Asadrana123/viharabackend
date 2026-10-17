// services/calling/facetime/facetimeCallService.js
//
// The life of one FaceTime call (FaceTime test):
//
//   1. dispatchCall (vapiService) decides a call goes over FaceTime and calls
//      queueFacetimeCall(). The daily dial guard is already claimed by then,
//      so the one-call-a-day rule holds exactly as for phone calls.
//   2. The Mac agent picks the job up (claimNextJob), dials, and reports each
//      step (reportStatus).
//   3. When the person answers, the agent calls markAnswered(): only now do we
//      open a Vapi websocket call, and the agent bridges FaceTime audio to it.
//      Same Maya, same prompt and memory, same end-of-call webhook.
//   4. If the call never rang (Mac problem), the job falls back to a normal
//      Vapi phone call right away. Once it rang, it counts as today's call.
//
// Existing schedulers poll Vapi with the call id dispatchCall returned. For a
// FaceTime job that id is "ft_<jobId>", and vapiService.getCall asks
// getFacetimeCall() here, which answers in Vapi's own shape.
const axios = require("axios");
const FacetimeCallJob = require("../../../model/calling/facetimeCallJobModel");
const { NEVER_RANG_STATUSES } = FacetimeCallJob;
const VtextLine = require("../../../model/vtext/vtextLineModel");
const { pickCallerNumberId } = require("../callerNumberPoolService");
const { phoneKey } = require("../dailyDialGuard");
const { notifyVtextAlert } = require("../../shared/slackService");

const FACETIME_CALL_PREFIX = "ft_";

// Audio the Mac agent sends and receives on the Vapi websocket: 16 kHz mono
// 16-bit PCM. To be confirmed on the first real test (Phase 2).
const AUDIO_FORMAT = { format: "pcm_s16le", container: "raw", sampleRate: 16000 };

// The Mac switches FaceTime off for itself after this many failed calls in a row.
const MAX_CONSECUTIVE_FAILURES = Number(process.env.FACETIME_MAX_CONSECUTIVE_FAILURES || 3);

// Daily-guard release functions for jobs still in flight, so a job where every
// way of calling failed gives the number back for today. In memory: a restart
// mid-call only means that number isn't retried until tomorrow.
const pendingReleases = new Map();

const isFacetimeCallId = (callId) => String(callId || "").startsWith(FACETIME_CALL_PREFIX);
const jobIdFromCallId = (callId) => String(callId).slice(FACETIME_CALL_PREFIX.length);

function vapiHeaders() {
  return { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, "Content-Type": "application/json" };
}

function vapiError(err) {
  const data = err.response?.data;
  return (Array.isArray(data?.message) ? data.message.join(", ") : data?.message) || data?.error || err.message;
}

async function alert(level, title, fields) {
  try {
    await notifyVtextAlert({ level, title: `FaceTime: ${title}`, fields });
  } catch (err) {
    console.error("[facetime] Slack alert failed (non-fatal):", err.message);
  }
}

/** Move a job from one of `from` to `to`, only if it's still there. Returns the updated job or null. */
async function transition(jobId, from, to, { lineId, note = "", set = {} } = {}) {
  const filter = { _id: jobId, status: { $in: from } };
  if (lineId) filter.lineId = lineId;
  return FacetimeCallJob.findOneAndUpdate(
    filter,
    { $set: { status: to, ...set }, $push: { events: { status: to, at: new Date(), note } } },
    { new: true }
  );
}

async function releaseDial(jobId) {
  const release = pendingReleases.get(String(jobId));
  pendingReleases.delete(String(jobId));
  if (release) await release();
}

/** Count Mac-side failures; enough in a row switches FaceTime off on that Mac and tells Slack. */
async function noteLineOutcome(lineId, ok, reason = "") {
  try {
    if (ok) {
      await VtextLine.updateOne({ _id: lineId }, { $set: { "facetime.consecutiveFailures": 0 } });
      return;
    }
    const line = await VtextLine.findOneAndUpdate(
      { _id: lineId },
      { $inc: { "facetime.consecutiveFailures": 1 } },
      { new: true }
    ).select("name facetime");
    if (line && line.facetime.enabled && line.facetime.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      const pausedReason = `${line.facetime.consecutiveFailures} FaceTime calls failed in a row (last: ${reason})`;
      await VtextLine.updateOne({ _id: lineId }, { $set: { "facetime.enabled": false, "facetime.pausedReason": pausedReason } });
      await alert("error", "Mac switched off for FaceTime", [
        { label: "Mac", value: line.name },
        { label: "Why", value: pausedReason },
        { label: "What happens now", value: "Calls go out as normal phone calls. Turn FaceTime back on for this Mac in the admin panel once it's fixed." },
      ]);
    }
  } catch (err) {
    console.error("[facetime] line outcome update failed (non-fatal):", err.message);
  }
}

/**
 * Hand a call to a Mac. Called by dispatchCall after the daily guard and the
 * prompt are ready.
 * @returns {Promise<{success: true, callId: string, phone: string, channel: "facetime"}>}
 */
async function queueFacetimeCall({ line, phone, person, metadata, assistantOverrides, release }) {
  const e164 = `+${phoneKey(phone)}`;
  const job = await FacetimeCallJob.create({
    lineId: line._id,
    phone: e164,
    fullName: person.fullName || "",
    source: metadata.source || "",
    metadata,
    assistantOverrides,
    events: [{ status: "queued", at: new Date(), note: `on ${line.name}` }],
  });
  if (release) pendingReleases.set(String(job._id), release);

  const callId = `${FACETIME_CALL_PREFIX}${job._id}`;
  console.log(`📱 FaceTime call queued: ${person.fullName} → ${e164} | Mac ${line.name} | Call ID: ${callId}`);
  return { success: true, callId, phone, channel: "facetime" };
}

/** The Mac asks for work. Gives it its oldest waiting job, at most one at a time. */
async function claimNextJob(lineId) {
  const busy = await FacetimeCallJob.exists({ lineId, status: { $in: ["claimed", "dialing", "ringing", "answered"] } });
  if (busy) return null;
  return FacetimeCallJob.findOneAndUpdate(
    { lineId, status: "queued" },
    { $set: { status: "claimed", claimedAt: new Date() }, $push: { events: { status: "claimed", at: new Date() } } },
    { new: true, sort: { queuedAt: 1 } }
  ).select("phone fullName status");
}

/** Never rang: send a normal Vapi phone call instead, holding the same daily-guard slot. */
async function fallbackToPhone(jobId, reason) {
  const job = await transition(jobId, NEVER_RANG_STATUSES, "fell-back", { note: reason, set: { failureReason: reason } });
  if (!job) return null; // already moved on (rang, answered, or another fallback won)

  try {
    const phoneNumberId = await pickCallerNumberId();
    if (!phoneNumberId) throw new Error("daily call cap reached on all caller numbers");
    const { data } = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: process.env.VAPI_ASSISTANT_ID,
        phoneNumberId,
        metadata: { ...job.metadata, channel: "phone", facetimeJobId: String(job._id) },
        customer: { number: job.phone, name: job.fullName },
        assistantOverrides: job.assistantOverrides,
      },
      { headers: vapiHeaders() }
    );
    await FacetimeCallJob.updateOne({ _id: job._id }, { $set: { vapiCallId: data.id, channelUsed: "phone", finishedAt: new Date() } });
    pendingReleases.delete(String(job._id));
    console.log(`↩️  FaceTime didn't ring (${reason}), phone call sent instead: ${job.fullName} → ${job.phone} | Vapi ${data.id}`);
  } catch (err) {
    const why = vapiError(err);
    await FacetimeCallJob.updateOne(
      { _id: job._id },
      { $set: { status: "failed", failureReason: `${reason}; phone fallback failed: ${why}`, finishedAt: new Date() }, $push: { events: { status: "failed", note: `phone fallback failed: ${why}` } } }
    );
    await releaseDial(job._id); // they got no call at all, so today's slot goes back
    console.error(`❌ FaceTime fallback phone call failed: ${job.fullName} → ${job.phone}:`, why);
  }
  await noteLineOutcome(job.lineId, false, reason);
  return job;
}

/**
 * The Mac reports a step. Allowed: dialing, ringing, no-answer, declined, failed, ended.
 * @returns {Promise<object|null>} the job after the change, or null when the change didn't apply
 */
async function reportStatus(lineId, jobId, status, note = "") {
  const now = new Date();
  switch (status) {
    case "dialing":
      return transition(jobId, ["claimed"], "dialing", { lineId, note, set: { dialingAt: now } });
    case "ringing":
      return transition(jobId, ["claimed", "dialing"], "ringing", { lineId, note, set: { ringingAt: now } });
    case "no-answer":
    case "declined": {
      const job = await transition(jobId, ["claimed", "dialing", "ringing"], status, { lineId, note, set: { finishedAt: now } });
      if (job) {
        pendingReleases.delete(String(job._id)); // it rang: that's today's call
        await noteLineOutcome(lineId, true);
      }
      return job;
    }
    case "failed": {
      const current = await FacetimeCallJob.findOne({ _id: jobId, lineId }).select("status");
      if (!current) return null;
      if (NEVER_RANG_STATUSES.includes(current.status)) return fallbackToPhone(jobId, note || "Mac reported a failure before it rang");
      const job = await transition(jobId, ["ringing", "answered"], "failed", { lineId, note, set: { failureReason: note, finishedAt: now } });
      if (job) {
        pendingReleases.delete(String(job._id));
        await noteLineOutcome(lineId, false, note || "failed during the call");
      }
      return job;
    }
    case "ended": {
      const job = await transition(jobId, ["answered"], "ended", { lineId, note, set: { finishedAt: now } });
      if (job) await noteLineOutcome(lineId, true);
      return job;
    }
    default:
      throw new Error(`unknown status "${status}"`);
  }
}

/** Start Maya on a Vapi websocket call. Retries once without `customer` in case Vapi rejects a number on a websocket call. */
async function createWebsocketCall(job) {
  const body = {
    assistantId: process.env.VAPI_ASSISTANT_ID,
    metadata: { ...job.metadata, channel: "facetime", facetimeJobId: String(job._id), phone: job.phone, fullName: job.fullName },
    customer: { number: job.phone, name: job.fullName },
    assistantOverrides: job.assistantOverrides,
    transport: { provider: "vapi.websocket", audioFormat: AUDIO_FORMAT },
  };
  try {
    const { data } = await axios.post("https://api.vapi.ai/call", body, { headers: vapiHeaders() });
    return data;
  } catch (err) {
    if (err.response?.status !== 400) throw err;
    console.warn("[facetime] Vapi refused the websocket call with a customer number, retrying without it:", vapiError(err));
    const { customer, ...withoutCustomer } = body;
    const { data } = await axios.post("https://api.vapi.ai/call", withoutCustomer, { headers: vapiHeaders() });
    return data;
  }
}

/**
 * The person picked up. Opens Maya's websocket call and gives the Mac the link.
 * @returns {Promise<{websocketCallUrl: string, audioFormat: object}|null>} null when the job isn't waiting for an answer
 */
async function markAnswered(lineId, jobId) {
  const job = await transition(jobId, ["claimed", "dialing", "ringing"], "answered", { lineId, set: { answeredAt: new Date() } });
  if (!job) return null;
  pendingReleases.delete(String(job._id)); // they picked up: that's today's call

  try {
    const call = await createWebsocketCall(job);
    const websocketCallUrl = call?.transport?.websocketCallUrl;
    if (!websocketCallUrl) throw new Error("Vapi did not return a websocket link");
    await FacetimeCallJob.updateOne({ _id: job._id }, { $set: { vapiCallId: call.id, channelUsed: "facetime" } });
    console.log(`✅ FaceTime answered, Maya connected: ${job.fullName} → ${job.phone} | Vapi ${call.id}`);
    return { websocketCallUrl, audioFormat: AUDIO_FORMAT };
  } catch (err) {
    const why = vapiError(err);
    await FacetimeCallJob.updateOne(
      { _id: job._id },
      { $set: { status: "failed", failureReason: `picked up, but Maya could not start: ${why}`, finishedAt: new Date() }, $push: { events: { status: "failed", note: why } } }
    );
    await noteLineOutcome(lineId, false, `Maya could not start: ${why}`);
    console.error(`❌ FaceTime answered but the Vapi websocket call failed: ${job.phone}:`, why);
    throw new Error(`Maya could not start: ${why}`);
  }
}

// How each final state looks to a poller expecting a Vapi call (registrationCallService.isPickup).
const ENDED_REASON = {
  "no-answer": "customer-did-not-answer",
  declined: "customer-busy",
  failed: "call-start-error",
  "fell-back": "call-start-error", // only seen when the fallback hasn't recorded its Vapi call yet
  ended: "call-start-error", // answered but no Vapi call recorded: Maya never spoke
};

/**
 * What vapiService.getCall returns for an "ft_" call id.
 * @returns {Promise<{vapiCallId: string}|object>} the real Vapi call to fetch, or a Vapi-shaped stand-in
 */
async function getFacetimeCall(callId) {
  const job = await FacetimeCallJob.findById(jobIdFromCallId(callId)).select("status vapiCallId").lean();
  if (!job) return { id: callId, status: "ended", endedReason: "call-start-error" };
  if (job.vapiCallId) return { vapiCallId: job.vapiCallId };
  if (ENDED_REASON[job.status]) return { id: callId, status: "ended", endedReason: ENDED_REASON[job.status] };
  return { id: callId, status: job.status === "ringing" ? "ringing" : "queued" };
}

module.exports = {
  FACETIME_CALL_PREFIX,
  AUDIO_FORMAT,
  isFacetimeCallId,
  queueFacetimeCall,
  claimNextJob,
  reportStatus,
  markAnswered,
  fallbackToPhone,
  getFacetimeCall,
  noteLineOutcome,
  alert,
};
