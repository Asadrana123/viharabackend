// services/callLogService.js
const CallLog = require("../../model/calling/callLogModel");
const { summarizeTranscript } = require("./callSummaryService");
const { mapCallLog } = require("./vapiCallsService");
const { notifyNewLead } = require("../shared/slackService");

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
 * Post an "interested" call to Slack — at most ONCE per call.
 *
 * Best-effort, never throws, never blocks the webhook (fire-and-forget). We
 * decide "interested" with the SAME logic the admin table uses (mapCallLog →
 * outcome "positive"), so Slack and the dashboard always agree.
 *
 * Dedup: an atomic claim on `interestedSlackNotifiedAt` (null → now). Only the
 * caller that flips it from null wins and sends, so a re-delivered end-of-call
 * webhook — or two concurrent deliveries — can never double-post.
 *
 * Channel: SLACK_INTERESTED_WEBHOOK_URL. If unset, notifyNewLead falls back to
 * the general SLACK_LEADS_WEBHOOK_URL, so nothing breaks when it isn't set.
 */
async function notifyIfInterested(saved) {
  try {
    if (!saved || !saved._id) return;
    if (saved.interestedSlackNotifiedAt) return; // already handled — fast path

    let view;
    try {
      view = mapCallLog(saved);
    } catch (e) {
      return; // mapping failed → nothing to notify on
    }
    if (view.outcome !== "positive") return; // only genuinely interested calls

    // Atomic claim: flip null → now. Returns the doc only if WE won the claim.
    const claimed = await CallLog.findOneAndUpdate(
      { _id: saved._id, interestedSlackNotifiedAt: null },
      { $set: { interestedSlackNotifiedAt: new Date() } }
    ).lean();
    if (!claimed) return; // someone already notified for this call

    const summary = String(saved.summary || "").trim();
    notifyNewLead({
      leadType: "Interested",
      name: view.name,
      phone: view.phone,
      source: saved.source || "",
      extraFields: [
        { label: "Call Result", value: "🔥 Interested" },
        { label: "Lead Score", value: view.score },
        { label: "Duration", value: view.duration },
        // Slack caps field text; clip long summaries so the message never fails.
        summary ? { label: "Summary", value: summary.slice(0, 700) } : null,
      ].filter(Boolean),
      webhookUrl: process.env.SLACK_INTERESTED_WEBHOOK_URL,
    }).catch((e) =>
      console.error("[slack] interested notification failed:", e.message)
    );
  } catch (e) {
    console.error("[slack] notifyIfInterested error (non-fatal):", e.message);
  }
}

/**
 * Persist one VAPI `end-of-call-report` message as a CallLog row.
 * Deduplicates on vapiCallId so a re-delivered webhook updates the same row.
 * Returns the saved document.
 *
 * Summary handling: if VAPI supplied its own summary we keep it; otherwise we
 * generate one ourselves from the transcript via Claude (best-effort, never
 * fatal — a failure just leaves summary empty, the transcript is still saved).
 *
 * Side-effect: if the call reads as "interested", it is posted to Slack once
 * (see notifyIfInterested — fire-and-forget, never blocks this function).
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

  let saved;
  if (doc.vapiCallId) {
    saved = await CallLog.findOneAndUpdate(
      { vapiCallId: doc.vapiCallId },
      { $set: doc },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } else {
    saved = await CallLog.create(doc);
  }

  // Fire-and-forget: post to Slack if interested. Never blocks the webhook.
  notifyIfInterested(saved);

  return saved;
}

module.exports = { saveEndOfCallReport };
