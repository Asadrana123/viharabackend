const axios = require("axios");
const {
  buildContact,
  parseContactsCsv,
  runSingleCall,
  createCampaign,
  runCampaign,
  getCampaign,
} = require("../services/vapiCampaignService");
const { resolveProperty } = require("../services/vapiPropertyService");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

/**
 * POST /api/vapi/call
 * Dispatch a call to a single contact entered from the admin panel.
 */
/**
 * POST /api/vapi/call
 * Dispatch a call to a single contact entered from the admin panel.
 */
const startSingleCall = catchAsyncError(async (req, res, next) => {
  const {
    fullName, phone, address, city, state, zip, email,
    enrich = true, propertyId,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  const contact = buildContact({ fullName, phones: phone, address, city, state, zip, email });

  if (!contact.phones.length)
    return next(
      new ErrorHandler("Phone number is invalid. Use a 10-digit US number.", 400)
    );

  let property;
  try {
    property = await resolveProperty(propertyId);
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }

  const result = await runSingleCall(contact, {
    enrich: Boolean(enrich),
    property,
  });

  const anySuccess = result.calls.some((c) => c.success);
  if (!anySuccess)
    return next(
      new ErrorHandler(
        result.calls[0]?.error || "VAPI rejected the call request",
        502
      )
    );

  res.status(200).json({
    success: true,
    message: `Call dispatched to ${result.name}`,
    result,
  });
});

/**
 * POST /api/vapi/launch-campaign
 * Accepts a CSV payload, queues a background campaign and returns a jobId.
 * Progress is polled via GET /api/vapi/campaign/:jobId.
 */
/**
 * POST /api/vapi/launch-campaign
 * Accepts a CSV payload, queues a background campaign and returns a jobId.
 * Progress is polled via GET /api/vapi/campaign/:jobId.
 */
const launchCampaign = catchAsyncError(async (req, res, next) => {
  const { csvData, enrich = true, propertyId } = req.body;

  if (!csvData || !csvData.trim())
    return next(new ErrorHandler("csvData is required", 400));

  let contacts;
  try {
    contacts = parseContactsCsv(csvData);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  // Resolve once up front so a bad propertyId fails fast instead of
  // surfacing 200 calls deep into the background worker.
  let property;
  try {
    property = await resolveProperty(propertyId);
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }

  const job = createCampaign(contacts, { enrich: Boolean(enrich), property });

  // Fire and forget — the worker updates job state in the background.
  runCampaign(job.id).catch((err) =>
    console.error(`❌ Unhandled campaign error (${job.id}):`, err)
  );

  res.status(202).json({
    success: true,
    message: `Campaign queued — ${contacts.length} contacts`,
    jobId: job.id,
    total: contacts.length,
    property: property.address,
  });
});

/**
 * GET /api/vapi/campaign/:jobId
 */
const getCampaignStatus = catchAsyncError(async (req, res, next) => {
  const job = getCampaign(req.params.jobId);
  if (!job)
    return next(new ErrorHandler("Campaign not found or expired", 404));

  res.status(200).json({ success: true, job });
});

/**
 * GET /api/vapi/calls
 * Fetches real call data from VAPI and derives outcome + score from
 * actual VAPI field names confirmed from raw response logs.
 */
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
    recordingUrl: call.artifact?.recordingUrl || call.recordingUrl || null,
    cost: call.cost || 0,
  };
}

const getCalls = catchAsyncError(async (req, res, next) => {
  if (!VAPI_API_KEY) return next(new ErrorHandler("VAPI_API_KEY not configured", 500));

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

  let allCalls = [];
  let createdAtLt = null;
  const fetchLimit = 100; // fetch in 100s from VAPI to find our page

  // We need to paginate server-side over VAPI's cursor-based API
  // Collect enough to serve the requested page
  const skipCount = (page - 1) * limit;
  let totalFetched = 0;

  while (true) {
    const params = { limit: fetchLimit };
    if (VAPI_ASSISTANT_ID) params.assistantId = VAPI_ASSISTANT_ID;
    if (createdAtLt) params.createdAtLt = createdAtLt;

    const response = await axios.get("https://api.vapi.ai/call", {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      params,
    });

    const batch = response.data || [];
    if (!Array.isArray(batch) || batch.length === 0) break;

    allCalls = allCalls.concat(batch);
    totalFetched += batch.length;

    // Stop once we have enough to serve the page
    if (totalFetched >= skipCount + limit) break;
    if (batch.length < fetchLimit) break;

    createdAtLt = batch[batch.length - 1].createdAt;
  }

  // Compute stats from all fetched so far (for accuracy, fetch all for stats separately if needed)
  // For now stats reflect only fetched calls — acceptable for paginated view
  const mappedAll = allCalls.map((call) => mapCall(call));
  const pageSlice = mappedAll.slice(skipCount, skipCount + limit);

  const total     = allCalls.length; // approximate — only calls fetched so far
  const connected = mappedAll.filter(c => c.outcome !== "missed").length;
  const positive  = mappedAll.filter(c => c.outcome === "positive").length;
  const negative  = mappedAll.filter(c => c.outcome === "negative").length;
  const voicemail = mappedAll.filter(c => c.outcome === "voicemail").length;
  const missed    = mappedAll.filter(c => c.outcome === "missed").length;
  const callback  = mappedAll.filter(c => c.outcome === "callback").length;
  const totalCost = mappedAll.reduce((sum, c) => sum + (c.cost || 0), 0);

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
    calls: pageSlice,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: skipCount + limit < total,
      hasPrev: page > 1,
    },
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
 * Derive outcome using REAL endedReason values from VAPI logs.
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
 * Score 0–100 based on outcome, duration and transcript keyword signals.
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

module.exports = {
  launchCampaign,
  getCalls,
  startSingleCall,
  getCampaignStatus,
};