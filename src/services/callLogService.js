// services/callLogService.js
const CallLog = require("../model/callLogModel");
const { summarizeTranscript } = require("./callSummaryService");

// VAPI puts the same data in slightly different places depending on version and
// whether an analysis plan is configured, so read each field from every spot it
// might appear and take the first that exists.

function pickSummary(message) {
  return (message.analysis && message.analysis.summary) || message.summary || "";
}

function pickTranscript(message) {
  return (
    (message.artifact && message.artifact.transcript) ||
    message.transcript ||
    ""
  );
}

function pickRecordingUrl(message) {
  return (
    (message.artifact && message.artifact.recordingUrl) ||
    message.recordingUrl ||
    message.stereoRecordingUrl ||
    ""
  );
}

function pickDurationSeconds(message) {
  if (Number.isFinite(message.durationSeconds)) return message.durationSeconds;
  if (Number.isFinite(message.durationMs)) {
    return Math.round(message.durationMs / 1000);
  }
  const s = message.startedAt ? new Date(message.startedAt).getTime() : null;
  const e = message.endedAt ? new Date(message.endedAt).getTime() : null;
  if (s && e && e > s) return Math.round((e - s) / 1000);
  return 0;
}

/**
 * Persist one VAPI `end-of-call-report` message as a CallLog row.
 * Deduplicates on vapiCallId so a re-delivered webhook updates the same row.
 * Returns the saved document.
 *
 * Summary handling: if VAPI supplied its own summary we keep it; otherwise we
 * generate one ourselves from the transcript via Claude (best-effort, never
 * fatal — a failure just leaves summary empty, the transcript is still saved).
 */
async function saveEndOfCallReport(message = {}) {
  const call = message.call || {};
  const customer = call.customer || {};
  const metadata = call.metadata || {};
  const analysis = message.analysis || {};

  const doc = {
    phone: customer.number || "",
    fullName: customer.name || metadata.fullName || "",
    propertyId: metadata.propertyId || null,
    source: metadata.source || "",
    vapiCallId: call.id || "",
    endedReason: message.endedReason || "",
    summary: pickSummary(message),
    transcript: pickTranscript(message),
    recordingUrl: pickRecordingUrl(message),
    structuredData: analysis.structuredData || null,
    successEvaluation:
      analysis.successEvaluation != null ? analysis.successEvaluation : null,
    durationSeconds: pickDurationSeconds(message),
    startedAt: message.startedAt ? new Date(message.startedAt) : null,
    endedAt: message.endedAt ? new Date(message.endedAt) : null,
    cost: Number.isFinite(message.cost) ? message.cost : 0,
  };

  // No summary from VAPI but we have a transcript → make our own with Claude.
  if (!String(doc.summary || "").trim() && String(doc.transcript || "").trim()) {
    try {
      const ai = await summarizeTranscript(doc.transcript);
      if (ai && ai.summary) {
        doc.summary = ai.summary;
        doc.structuredData = {
          ...(doc.structuredData || {}),
          interestLevel: ai.interestLevel || "",
          objections: ai.objections || "",
          buyBox: ai.buyBox || "",
        };
        console.log("[cb-debug] generated summary from transcript. interest:", ai.interestLevel || "(n/a)");
      }
    } catch (err) {
      console.error("[cb-debug] summarizeTranscript failed (non-fatal):", err.message);
    }
  }

  if (doc.vapiCallId) {
    return CallLog.findOneAndUpdate(
      { vapiCallId: doc.vapiCallId },
      { $set: doc },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  return CallLog.create(doc);
}

module.exports = { saveEndOfCallReport };
