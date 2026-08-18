// services/callLogService.js
const CallLog = require("../model/callLogModel");

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
