// services/vapiCallsService.js
//
// Maps calls into the lightweight, TEXT-ONLY shape the admin panel renders.
// No recording URL is ever produced here, so nothing downstream can surface
// call audio.
//
// SOURCE OF TRUTH FOR THE ADMIN TABLE = CallLog (our own DB).
// Every completed call is already persisted to CallLog from VAPI's
// `end-of-call-report` webhook (see callLogService.js), keyed by `phone` and
// indexed on { phone: 1, createdAt: -1 }. So `getCallsForPhones` reads calls
// for EXACTLY the phone numbers the admin is viewing — no VAPI request, no
// 400-call scan. VAPI's List Calls API cannot filter by the customer's number
// (only call/assistant/phone-number id or timestamps), so scanning was the only
// way to use it; reading our indexed CallLog avoids that entirely.
//
// `fetchRecentCalls` / `mapCall` remain for any caller that still needs the raw
// VAPI-shaped list (e.g. an "all recent calls" view). They are NOT used by the
// admin lead table anymore.

const axios = require("axios");
const CallLog = require("../../model/calling/callLogModel");
const { MISSED_REASONS, deriveOutcome, deriveLeadScore } = require("./callOutcome");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_CALL_URL = "https://api.vapi.ai/call";

// How far back we scan when using the raw VAPI list (fetchRecentCalls only).
const DEFAULT_SCAN = 400;

// Safety cap on how many CallLog rows we ever pull for one page of leads, so a
// single high-volume number can't return an unbounded array. Scaled to the page
// size; a normal page (≤ ~50 leads) stays far under this.
const CALLLOG_HARD_CAP = 5000;

// ─── Phone matching ─────────────────────────────────────────────────────────
/**
 * Normalise a stored lead phone to the E.164 shape VAPI reports (and the shape
 * CallLog stores, since CallLog.phone = customer.number from VAPI), so a call
 * matches its lead regardless of how the number was typed on the form.
 */
const normalisePhone = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : "";
};

// ─── Admin table read (CallLog-backed, scoped to the phones on screen) ────────
/**
 * Build { "+1555…": [mappedCall, …] } for the given lead phones, reading ONLY
 * those numbers from CallLog. Best-effort: a DB failure returns {} so callers
 * still render their leads (with blank call columns).
 *
 * @param {string[]} phones  raw lead phone numbers for the current page
 * @param {object}   [opts]  { max } accepted for backwards-compat; ignored for
 *                           scoping since we now query by exact phone.
 */
const getCallsForPhones = async (phones = [], opts = {}) => {
  const wanted = [...new Set(phones.map(normalisePhone).filter(Boolean))];
  const byPhone = {};
  if (wanted.length === 0) return byPhone;

  // Guard the result size relative to how many numbers we're actually asking
  // for; newest calls survive the cap because we sort by createdAt desc.
  const limit = Math.min(CALLLOG_HARD_CAP, Math.max(500, wanted.length * 50));

  let rows = [];
  try {
    rows = await CallLog.find({ phone: { $in: wanted } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch (err) {
    console.error("[vapi-calls] CallLog read failed:", err.message);
    return byPhone;
  }

  for (const row of rows) {
    const number = row.phone || "";
    if (!number) continue;
    (byPhone[number] ||= []).push(mapCallLog(row));
  }

  // Rows come back newest-first already; keep each phone's list explicitly
  // sorted so grouping order can never surprise a caller.
  for (const num of Object.keys(byPhone)) {
    byPhone[num].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  return byPhone;
};

// A "pickup" = a human actually answered (voicemail + missed are not).
const PICKUP_OUTCOMES = new Set(["positive", "negative", "callback"]);

/**
 * Light version of getCallsForPhones for list views. Per phone: the newest call
 * (mapped), how many calls there were, and whether any was a pickup. Mongo does
 * the grouping, so the transcripts of the many no-answer callback calls never
 * leave the database — only calls someone may have answered are read in full.
 * Best-effort like getCallsForPhones: a DB failure returns {}.
 *
 * Returns { "+1555…": { latest, count, pickedUp } }.
 */
const getCallSummaryForPhones = async (phones = []) => {
  const wanted = [...new Set(phones.map(normalisePhone).filter(Boolean))];
  const byPhone = {};
  if (wanted.length === 0) return byPhone;

  let groups = [];
  let maybeAnswered = [];
  try {
    [groups, maybeAnswered] = await Promise.all([
      CallLog.aggregate([
        { $match: { phone: { $in: wanted } } },
        { $sort: { phone: 1, createdAt: -1 } },
        {
          $group: {
            _id: "$phone",
            count: { $sum: 1 },
            latest: {
              $first: {
                _id: "$_id",
                vapiCallId: "$vapiCallId",
                phone: "$phone",
                endedReason: "$endedReason",
                durationSeconds: "$durationSeconds",
                transcript: "$transcript",
                grade: "$grade",
                startedAt: "$startedAt",
                createdAt: "$createdAt",
              },
            },
          },
        },
      ]),
      // A superset of the pickups: everything deriveOutcome doesn't rule out
      // from endedReason alone. Their outcome is then derived exactly as usual.
      CallLog.find({
        phone: { $in: wanted },
        endedReason: { $nin: [...MISSED_REASONS, "voicemail"], $not: /error|failed/i },
      })
        .select("phone endedReason durationSeconds transcript grade")
        .lean(),
    ]);
  } catch (err) {
    console.error("[vapi-calls] CallLog summary failed:", err.message);
    return byPhone;
  }

  for (const g of groups) {
    byPhone[g._id] = { latest: mapCallLog(g.latest), count: g.count, pickedUp: false };
  }
  for (const row of maybeAnswered) {
    const entry = byPhone[row.phone];
    if (entry && !entry.pickedUp) entry.pickedUp = PICKUP_OUTCOMES.has(mapCallLog(row).outcome);
  }

  return byPhone;
};

// ─── Raw VAPI list (kept for non-admin-table consumers) ───────────────────────
/** Cursor-paginate VAPI's call list up to `max` calls (bounded). */
const fetchRecentCalls = async ({ max = DEFAULT_SCAN } = {}) => {
  if (!VAPI_API_KEY) throw new Error("VAPI_API_KEY not configured");

  const pageSize = 100;
  let all = [];
  let createdAtLt = null;

  while (all.length < max) {
    const params = { limit: pageSize };
    if (VAPI_ASSISTANT_ID) params.assistantId = VAPI_ASSISTANT_ID;
    if (createdAtLt) params.createdAtLt = createdAtLt;

    const { data } = await axios.get(VAPI_CALL_URL, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      params,
    });

    const batch = Array.isArray(data) ? data : [];
    if (batch.length === 0) break;

    all = all.concat(batch);
    if (batch.length < pageSize) break;
    createdAtLt = batch[batch.length - 1].createdAt;
  }

  return all.slice(0, max);
};

// ─── Mapping ──────────────────────────────────────────────────────────────────
/**
 * Map a CallLog row into the admin-table shape (same fields as mapCall). The
 * stored grade (callGradeService) wins; rows without one use the rules.
 *
 * Note: `enriched` came from a VAPI-only prompt variable (prospect_research)
 * that CallLog does not persist, so it is reported as false here. It is not one
 * of the rendered columns; if you need it, persist that flag on the CallLog row.
 */
function mapCallLog(row) {
  const durationSecs = Number(row.durationSeconds) || 0;
  // Shim exposing just the fields the derivers read from a raw VAPI call.
  const shim = {
    endedReason: row.endedReason || "",
    transcript: row.transcript || "",
  };
  const grade = row.grade && row.grade.outcome ? row.grade : null;
  const outcome = grade ? grade.outcome : deriveOutcome(shim, durationSecs);
  const score = grade ? grade.score : deriveLeadScore(shim, outcome, durationSecs);

  return {
    id: row.vapiCallId || String(row._id || ""),
    name: row.fullName || row.phone || "Unknown",
    phone: row.phone || "—",
    outcome,
    score,
    gradeReason: grade ? grade.reason || "" : "",
    gradedBy: grade ? grade.by : "rules",
    duration: formatDuration(durationSecs),
    durationSecs,
    enriched: false, // not derivable from CallLog (see note above)
    summary: row.summary || "",
    transcript: extractTranscript(shim),
    startedAt: row.startedAt || row.createdAt,
    endedAt: row.endedAt,
    endedReason: row.endedReason || "",
    cost: row.cost || 0,
  };
}

/** Map a raw VAPI call (from fetchRecentCalls) into the admin-table shape. */
function mapCall(call) {
  const durationSecs = calcDuration(call.startedAt, call.endedAt);
  const shim = { endedReason: call.endedReason, transcript: call.transcript || call.artifact?.transcript };
  const outcome = deriveOutcome(shim, durationSecs);
  const score = deriveLeadScore(shim, outcome, durationSecs);
  const transcript = extractTranscript(call);
  return {
    id: call.id,
    name: call.customer?.name || call.customer?.number || "Unknown",
    phone: call.customer?.number || "—",
    outcome,
    score,
    duration: formatDuration(durationSecs),
    durationSecs,
    enriched: !!(
      call.artifact?.variableValues?.prospect_research ||
      call.assistantOverrides?.variableValues?.prospect_research
    ),
    summary: call.analysis?.summary || "",
    transcript,
    startedAt: call.startedAt || call.createdAt,
    endedAt: call.endedAt,
    endedReason: call.endedReason || "",
    cost: call.cost || 0,
  };
}

function calcDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0;
  const diff = Math.floor((new Date(endedAt) - new Date(startedAt)) / 1000);
  return diff > 0 ? diff : 0;
}

function extractTranscript(call) {
  const messages = call.messages || call.artifact?.messages || [];
  const structured = messages
    .filter((m) => m.role === "bot" || m.role === "user")
    .map((m) => ({
      role: m.role === "bot" ? "ai" : "human",
      text: m.message || m.content || "",
    }))
    .filter((m) => m.text.trim().length > 0);

  if (structured.length > 0) return structured;

  const raw = call.transcript || call.artifact?.transcript || "";
  if (!raw) return [];

  return raw
    .split("\n")
    .map((line) => {
      if (line.startsWith("AI:")) return { role: "ai", text: line.replace(/^AI:\s*/, "").trim() };
      if (line.startsWith("User:")) return { role: "human", text: line.replace(/^User:\s*/, "").trim() };
      return null;
    })
    .filter((m) => m && m.text.length > 0);
}

function formatDuration(secs) {
  if (!secs || secs === 0) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

module.exports = {
  getCallsForPhones,
  getCallSummaryForPhones,
  PICKUP_OUTCOMES,
  fetchRecentCalls,
  normalisePhone,
  mapCall,
  mapCallLog,
};
