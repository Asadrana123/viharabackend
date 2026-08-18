// services/callMemoryService.js
const CallLog = require("../model/callLogModel");

// How far back to scan, and how many meaningful calls to actually surface.
const LOOKUP_LIMIT = 5; // most recent logs to read for this phone
const MAX_ENTRIES = 3; // meaningful calls to include in the prompt
const MAX_SUMMARY_CHARS = 500; // clip each summary so the prompt stays lean

function fmtDate(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_e) {
    return "";
  }
}

// Pull a few compact, human-readable bits out of whatever the VAPI analysis
// plan stored in structuredData. Shape is not fixed, so read defensively.
function fmtStructured(sd) {
  if (!sd || typeof sd !== "object") return "";
  const parts = [];
  if (sd.interestLevel) parts.push(`interest: ${sd.interestLevel}`);
  if (sd.buyBox) parts.push(`buy box: ${sd.buyBox}`);
  if (Array.isArray(sd.objections) && sd.objections.length) {
    parts.push(`objections: ${sd.objections.join(", ")}`);
  } else if (sd.objections) {
    parts.push(`objections: ${sd.objections}`);
  }
  return parts.length ? ` (${parts.join("; ")})` : "";
}

/**
 * Build a compact "what you already know about this caller" string from the
 * most recent MEANINGFUL calls to this phone. A meaningful call is one that
 * produced a summary — no-answer / voicemail attempts carry no memory and are
 * skipped, so a retry burst never makes Maya say "as we discussed" to someone
 * who never actually picked up.
 *
 * Returns "" when there's nothing worth referencing (e.g. a first-ever call, or
 * only missed attempts so far).
 */
async function buildPriorContext(phone) {
  const number = String(phone || "").trim();
  if (!number) return "";

  const logs = await CallLog.find({ phone: number })
    .sort({ createdAt: -1 })
    .limit(LOOKUP_LIMIT)
    .lean();

  const lines = [];
  for (const log of logs) {
    const summary = String(log.summary || "").trim();
    if (!summary) continue; // no memory worth surfacing → skip
    const date = fmtDate(log.createdAt);
    const extra = fmtStructured(log.structuredData);
    const clipped =
      summary.length > MAX_SUMMARY_CHARS
        ? summary.slice(0, MAX_SUMMARY_CHARS) + "…"
        : summary;
    lines.push(`• ${date ? date + ": " : ""}${clipped}${extra}`);
    if (lines.length >= MAX_ENTRIES) break;
  }

  return lines.join("\n");
}

module.exports = { buildPriorContext };
