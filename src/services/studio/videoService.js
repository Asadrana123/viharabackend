// services/studio/videoService.js
//
// The videos shown in the Video Studio. The Creative OS sends each job's summary with a shared key
// (STUDIO_SYNC_KEY), because its server takes no incoming calls and the website cannot ask it.

const crypto = require("node:crypto");

const CORE_ID = /^[A-Za-z0-9][A-Za-z0-9-]{1,60}$/;
const GATE_STATES = new Set(["pending", "approved", "revision_requested", "rejected"]);
const JOB_STATUSES = new Set(["draft", "ready_for_review", "failed", "approved", "rejected"]);
const MAX_BATCH = 500;
const MAX_FEEDBACK = 4000;

/** Compares the shared key without leaking its length or content through timing. */
function keyMatches(expected, given) {
  if (!expected || typeof given !== "string" || !given) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

const shortText = (value, max) => {
  const s = String(value ?? "").trim();
  if (!s || s.length > max) throw new Error(`A value of 1 to ${max} characters is required.`);
  return s;
};

const decision = (gate) => {
  const state = String(gate?.state ?? "pending");
  if (!GATE_STATES.has(state)) throw new Error(`Unknown gate state "${state}".`);
  return { state, by: gate?.by ? String(gate.by).slice(0, 80) : null };
};

const count = (value) => {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new Error("A clip count is a whole number.");
  return n;
};

/** Checks one job summary from the Creative OS and returns the fields stored. */
function cleanVideo(v) {
  const coreId = String(v?.coreId ?? "").trim();
  if (!CORE_ID.test(coreId)) throw new Error(`"${coreId}" is not a core id.`);
  const status = String(v?.status ?? "");
  if (!JOB_STATUSES.has(status)) throw new Error(`${coreId}: unknown status "${status}".`);
  const total = count(v?.gates?.clips?.total);
  const approved = count(v?.gates?.clips?.approved);
  if (approved > total) throw new Error(`${coreId}: more clips approved than exist.`);
  const duration = v?.durationSeconds == null ? null : Number(v.durationSeconds);
  if (duration !== null && !(duration >= 0)) throw new Error(`${coreId}: bad duration.`);
  const built = v?.lastBuildAt ? new Date(v.lastBuildAt) : null;
  if (built && Number.isNaN(built.getTime())) throw new Error(`${coreId}: bad build date.`);
  return {
    coreId,
    name: shortText(v?.name, 80),
    propertyId: shortText(v?.propertyId, 120),
    videoId: shortText(v?.videoId, 80),
    stage: shortText(v?.stage, 10),
    round: count(v?.round),
    status,
    gates: { plan: decision(v?.gates?.plan), clips: { total, approved }, cut: decision(v?.gates?.cut) },
    durationSeconds: duration,
    lastBuildAt: built,
  };
}

/** Every summary in a push, checked together: one bad row refuses the push and stores nothing. */
function cleanBatch(list) {
  if (!Array.isArray(list)) throw new Error("Send videos as a list.");
  if (list.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} videos in one push.`);
  const rows = list.map(cleanVideo);
  if (new Set(rows.map((r) => r.coreId)).size !== rows.length) throw new Error("A core id appears twice in the push.");
  return rows;
}

/** Feedback as typed; only the surrounding space is removed. */
function cleanFeedback(text) {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("Write the feedback.");
  if (value.length > MAX_FEEDBACK) throw new Error(`Feedback is at most ${MAX_FEEDBACK} characters.`);
  return value;
}

/** Feedback the Creative OS has not picked up yet, oldest first. */
function undelivered(videos) {
  const out = [];
  for (const v of videos) {
    for (const f of v.feedback ?? []) {
      if (!f.deliveredAt) out.push({ id: String(f._id), coreId: v.coreId, text: f.text, byName: f.byName, at: f.at });
    }
  }
  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

module.exports = { keyMatches, cleanVideo, cleanBatch, cleanFeedback, undelivered, MAX_FEEDBACK };
