const Papa = require("papaparse");
const axios = require("axios");
const { enrichPerson, buildResearchSummary } = require("../services/fullenrichService");
const { parsePhones, dispatchCall } = require("../services/vapiService");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /api/vapi/launch-campaign
 */
const launchCampaign = catchAsyncError(async (req, res, next) => {
  const { csvData } = req.body;
  if (!csvData) return next(new ErrorHandler("csvData is required", 400));

  const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
  if (!parsed.data || parsed.data.length === 0)
    return next(new ErrorHandler("No contacts found in CSV", 400));

  const contacts = parsed.data.map((row) => ({
    fullName: row["Full Name"] || "",
    address: row["Address"] || "",
    city: row["City"] || "",
    state: row["State"] || "",
    zip: row["Zip Code"] || "",
    phones: parsePhones(row["Phones"]),
    email: row["Emails"] ? row["Emails"].split("|")[0].trim() : null,
  }));

  const results = [];
  for (const person of contacts) {
    if (!person.fullName) continue;
    if (!person.phones.length) {
      results.push({ name: person.fullName, status: "skipped", reason: "no valid phones" });
      continue;
    }
    const enrichment = await enrichPerson(person);
    const researchSummary = buildResearchSummary(person, enrichment);
    const callResults = [];
    for (const phone of person.phones) {
      const result = await dispatchCall(phone, person, researchSummary);
      callResults.push(result);
      await delay(2000);
    }
    results.push({ name: person.fullName, status: "dispatched", calls: callResults });
    await delay(3000);
  }

  res.status(200).json({
    success: true,
    message: `Campaign complete — ${contacts.length} contacts processed`,
    results,
  });
});

/**
 * GET /api/vapi/calls
 * Fetches real call data from VAPI and derives outcome + score from
 * actual VAPI field names confirmed from raw response logs.
 */
const getCalls = catchAsyncError(async (req, res, next) => {
  if (!VAPI_API_KEY) return next(new ErrorHandler("VAPI_API_KEY not configured", 500));

  let allCalls = [];
  let createdAtLt = null;
  const limit = 100;

  while (true) {
    const params = { limit };
    if (VAPI_ASSISTANT_ID) params.assistantId = VAPI_ASSISTANT_ID;
    if (createdAtLt) params.createdAtLt = createdAtLt;

    const response = await axios.get("https://api.vapi.ai/call", {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      params,
    });

    const batch = response.data || [];
    if (!Array.isArray(batch) || batch.length === 0) break;
    allCalls = allCalls.concat(batch);
    if (batch.length < limit) break;
    createdAtLt = batch[batch.length - 1].createdAt;
  }

  const calls = allCalls.map((call) => {
    // Duration: VAPI doesn't return a duration field — calculate from timestamps
    const durationSecs = calcDuration(call.startedAt, call.endedAt);
    const outcome = deriveOutcome(call, durationSecs);
    const score = deriveLeadScore(call, outcome, durationSecs);
    const transcript = extractTranscript(call);

    return {
      id: call.id,
      // customer.name only exists if set at dispatch time — fallback to phone
      name: call.customer?.name || call.customer?.number || "Unknown",
      phone: call.customer?.number || "—",
      outcome,
      score,
      duration: formatDuration(durationSecs),
      durationSecs,
      // enriched = prospect_research variable was injected at call time
      enriched: !!(
        call.artifact?.variableValues?.prospect_research ||
        call.assistantOverrides?.variableValues?.prospect_research
      ),
      // analysis is {} in practice — VAPI only fills this if you configure
      // summaryPrompt/structuredDataSchema in your assistant settings
      summary: call.analysis?.summary || "",
      transcript,
      startedAt: call.startedAt || call.createdAt,
      endedAt: call.endedAt,
      endedReason: call.endedReason || "",
      recordingUrl: call.artifact?.recordingUrl || call.recordingUrl || null,
      cost: call.cost || 0,
    };
  });

  const total     = calls.length;
  const connected = calls.filter(c => c.outcome !== "missed").length;
  const positive  = calls.filter(c => c.outcome === "positive").length;
  const negative  = calls.filter(c => c.outcome === "negative").length;
  const voicemail = calls.filter(c => c.outcome === "voicemail").length;
  const missed    = calls.filter(c => c.outcome === "missed").length;
  const callback  = calls.filter(c => c.outcome === "callback").length;
  const totalCost = calls.reduce((sum, c) => sum + (c.cost || 0), 0);

  res.status(200).json({
    success: true,
    stats: {
      total,
      connected,
      positive,
      negative,
      voicemail,
      missed,
      callback,
      connectionRate: total > 0 ? Math.round((connected / total) * 100) : 0,
      interestRate: connected > 0 ? Math.round((positive / connected) * 100) : 0,
      totalCost: totalCost.toFixed(2),
    },
    calls,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate duration in seconds from ISO timestamps.
 * VAPI does NOT return a `duration` field on the call object.
 */
function calcDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0;
  const diff = Math.floor((new Date(endedAt) - new Date(startedAt)) / 1000);
  return diff > 0 ? diff : 0;
}

/**
 * Derive outcome using REAL endedReason values from VAPI logs:
 *
 * Confirmed "missed/failed" reasons:
 *   silence-timed-out, no-answer, call-start-error,
 *   call.in-progress.error-assistant-did-not-receive-customer-audio,
 *   twilio-failed-to-connect-call, customer-did-not-answer,
 *   customer-busy, pipeline-error, exceeded-max-duration
 *
 * Confirmed "connected" reasons:
 *   customer-ended-call, assistant-ended-call,
 *   assistant-forwarded-call
 *
 * Confirmed "voicemail":
 *   voicemail
 *
 * For connected calls, since analysis{} is empty, we parse the
 * raw transcript string which VAPI DOES populate.
 */
function deriveOutcome(call, durationSecs) {
  const reason = (call.endedReason || "").toLowerCase();

  // ── Definite missed / failed ──────────────────────────────────────────────
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

  // Partial match for long error strings like
  // "call.in-progress.error-assistant-did-not-receive-customer-audio"
  if (reason.includes("error") || reason.includes("failed")) return "missed";

  // ── Voicemail ─────────────────────────────────────────────────────────────
  if (reason === "voicemail") return "voicemail";

  // ── Connected calls — parse the raw transcript string ────────────────────
  // call.transcript is a plain string: "AI: ...\nUser: ...\nAI: ..."
  // call.artifact.transcript is the same string — both confirmed in logs
  const transcript = (call.transcript || call.artifact?.transcript || "").toLowerCase();

  // If the call connected but duration was very short and no user spoke — missed
  if (durationSecs < 8 && !transcript.includes("user:")) return "missed";

  // Opt-out / remove
  if (
    transcript.includes("remove me") ||
    transcript.includes("stop calling") ||
    transcript.includes("take me off") ||
    transcript.includes("don't call")
  ) return "negative";

  // Callback requested
  if (
    transcript.includes("call me back") ||
    transcript.includes("call back") ||
    transcript.includes("better time") ||
    transcript.includes("tomorrow") ||
    transcript.includes("friday") ||
    transcript.includes("monday")
  ) return "callback";

  // Positive interest
  if (
    transcript.includes("interested") ||
    transcript.includes("book") ||
    transcript.includes("schedule") ||
    transcript.includes("tell me more") ||
    transcript.includes("send me") ||
    transcript.includes("advisor") ||
    transcript.includes("yeah") && durationSecs > 60
  ) return "positive";

  // Not interested
  if (
    transcript.includes("not interested") ||
    transcript.includes("not looking") ||
    transcript.includes("no thanks") ||
    transcript.includes("not right now")
  ) return "negative";

  // Connected but unclear — if they spoke at all and call was reasonable length
  if (transcript.includes("user:") && durationSecs > 30) return "negative";

  return "missed";
}

/**
 * Score 0–100.
 * Since analysis{} is empty, score is based on:
 * - outcome type
 * - call duration (engagement signal)
 * - transcript keyword signals
 */
function deriveLeadScore(call, outcome, durationSecs) {
  if (outcome === "missed") return 0;
  if (outcome === "voicemail") return 20;

  const transcript = (call.transcript || call.artifact?.transcript || "").toLowerCase();

  let score = 0;

  // Base by outcome
  if (outcome === "positive")  score = 55;
  if (outcome === "callback")  score = 40;
  if (outcome === "negative")  score = 8;

  // Duration bonus — longer = more engaged
  if (durationSecs > 300)      score += 25; // >5 min
  else if (durationSecs > 180) score += 18; // >3 min
  else if (durationSecs > 90)  score += 10; // >1.5 min
  else if (durationSecs > 30)  score += 4;

  // Positive keyword bonuses from transcript
  if (transcript.includes("tell me more"))             score += 8;
  if (transcript.includes("advisor"))                  score += 8;
  if (transcript.includes("book") || transcript.includes("schedule")) score += 10;
  if (transcript.includes("send me"))                  score += 6;
  if (transcript.includes("platform"))                 score += 4;
  if (transcript.includes("arv") || transcript.includes("spread"))    score += 5;

  // Negative deductions
  if (transcript.includes("remove") || transcript.includes("stop"))   score -= 15;
  if (transcript.includes("not interested"))                           score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Extract transcript as [{role, text}] from call.messages array.
 * Confirmed from logs: roles are "bot" (not "assistant") and "user".
 * Filter out "system" role (the long prompt).
 */
function extractTranscript(call) {
  // Prefer messages array for structured turn-by-turn
  const messages = call.messages || call.artifact?.messages || [];
  const structured = messages
    .filter(m => m.role === "bot" || m.role === "user")
    .map(m => ({
      role: m.role === "bot" ? "ai" : "human",
      text: m.message || m.content || "",
    }))
    .filter(m => m.text.trim().length > 0);

  if (structured.length > 0) return structured;

  // Fallback: parse the raw transcript string "AI: ...\nUser: ..."
  const raw = call.transcript || call.artifact?.transcript || "";
  if (!raw) return [];

  return raw
    .split("\n")
    .map(line => {
      if (line.startsWith("AI:"))   return { role: "ai",    text: line.replace(/^AI:\s*/,   "").trim() };
      if (line.startsWith("User:")) return { role: "human", text: line.replace(/^User:\s*/, "").trim() };
      return null;
    })
    .filter(m => m && m.text.length > 0);
}

function formatDuration(secs) {
  if (!secs || secs === 0) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

module.exports = { launchCampaign, getCalls };