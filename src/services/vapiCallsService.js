// services/vapiCallsService.js
//
// Owns fetching VAPI calls and mapping them into the lightweight, TEXT-ONLY
// shape the admin panel renders. No recording URL is ever produced here, so
// nothing downstream can surface call audio.

const axios = require("axios");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_CALL_URL = "https://api.vapi.ai/call";

// How far back we scan when matching calls to leads. One-to-two pages covers
// current volume comfortably; raise if call history outgrows the window.
const DEFAULT_SCAN = 200;

// ─── Fetch ────────────────────────────────────────────────────────────────────
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

// ─── Phone matching ─────────────────────────────────────────────────────────
/**
 * Normalise a stored lead phone to the E.164 shape VAPI reports, so a call
 * matches its lead regardless of how the number was typed on the form.
 */
const normalisePhone = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : "";
};

/**
 * Build { "+1555…": [mappedCall, …] } for the given lead phones.
 * Best-effort: a VAPI failure returns {} so callers still render their leads.
 */
const getCallsForPhones = async (phones = [], { max = DEFAULT_SCAN } = {}) => {
  const wanted = new Set(phones.map(normalisePhone).filter(Boolean));
  const byPhone = {};
  if (wanted.size === 0) return byPhone;

  let calls = [];
  try {
    calls = await fetchRecentCalls({ max });
  } catch (err) {
    console.error("[vapi-calls] fetch failed:", err.message);
    return byPhone;
  }

  for (const raw of calls) {
    const number = raw.customer?.number || "";
    if (!wanted.has(number)) continue;
    (byPhone[number] ||= []).push(mapCall(raw));
  }

  for (const num of Object.keys(byPhone)) {
    byPhone[num].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  return byPhone;
};

// ─── Mapping (moved out of vapiController) ─────────────────────────────────────
function mapCall(call) {
  const durationSecs = calcDuration(call.startedAt, call.endedAt);
  const outcome = deriveOutcome(call, durationSecs);
  const score = deriveLeadScore(call, outcome, durationSecs);
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

function deriveOutcome(call, durationSecs) {
  const reason = (call.endedReason || "").toLowerCase();

  const missedReasons = [
    "no-answer",
    "customer-did-not-answer",
    "customer-busy",
    "silence-timed-out",
    "call-start-error",
    "twilio-failed-to-connect-call",
    "pipeline-error",
  ];
  if (missedReasons.includes(reason)) return "missed";
  if (reason.includes("error") || reason.includes("failed")) return "missed";
  if (reason === "voicemail") return "voicemail";

  const transcript = (call.transcript || call.artifact?.transcript || "").toLowerCase();

  if (durationSecs < 8 && !transcript.includes("user:")) return "missed";

  if (
    transcript.includes("remove me") ||
    transcript.includes("stop calling") ||
    transcript.includes("take me off") ||
    transcript.includes("don't call")
  ) return "negative";

  if (
    transcript.includes("call me back") ||
    transcript.includes("call back") ||
    transcript.includes("better time") ||
    transcript.includes("tomorrow") ||
    transcript.includes("friday") ||
    transcript.includes("monday")
  ) return "callback";

  if (
    transcript.includes("interested") ||
    transcript.includes("book") ||
    transcript.includes("schedule") ||
    transcript.includes("tell me more") ||
    transcript.includes("send me") ||
    transcript.includes("advisor") ||
    transcript.includes("yeah") && durationSecs > 60
  ) return "positive";

  if (
    transcript.includes("not interested") ||
    transcript.includes("not looking") ||
    transcript.includes("no thanks") ||
    transcript.includes("not right now")
  ) return "negative";

  if (transcript.includes("user:") && durationSecs > 30) return "negative";

  return "missed";
}

function deriveLeadScore(call, outcome, durationSecs) {
  if (outcome === "missed") return 0;
  if (outcome === "voicemail") return 20;

  const transcript = (call.transcript || call.artifact?.transcript || "").toLowerCase();
  let score = 0;

  if (outcome === "positive") score = 55;
  if (outcome === "callback") score = 40;
  if (outcome === "negative") score = 8;

  if (durationSecs > 300) score += 25;
  else if (durationSecs > 180) score += 18;
  else if (durationSecs > 90) score += 10;
  else if (durationSecs > 30) score += 4;

  if (transcript.includes("tell me more")) score += 8;
  if (transcript.includes("advisor")) score += 8;
  if (transcript.includes("book") || transcript.includes("schedule")) score += 10;
  if (transcript.includes("send me")) score += 6;
  if (transcript.includes("platform")) score += 4;
  if (transcript.includes("arv") || transcript.includes("spread")) score += 5;

  if (transcript.includes("remove") || transcript.includes("stop")) score -= 15;
  if (transcript.includes("not interested")) score -= 10;

  return Math.max(0, Math.min(100, score));
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
  fetchRecentCalls,
  getCallsForPhones,
  normalisePhone,
  mapCall,
};