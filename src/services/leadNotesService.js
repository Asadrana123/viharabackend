// services/leadNotesService.js
const LeadNote = require("../model/leadNoteModel");

/**
 * Given a lead type and a list of lead _ids, return their advisor notes grouped
 * by lead: { "<leadId>": [ {advisorName, text, createdAt, ...}, ...newest first ] }.
 *
 * Same shape/contract as getCallsForPhones / getEmailEventsForEmails — best-effort:
 * on any DB error it returns {} so the admin leads list still renders (each lead
 * just gets an empty `notes` array).
 */
const getNotesForLeads = async (leadType, leadIds = []) => {
  const ids = (leadIds || []).filter(Boolean);
  if (!leadType || !ids.length) return {};

  let notes = [];
  try {
    notes = await LeadNote.find({ leadType, leadId: { $in: ids } })
      .sort({ createdAt: -1 })
      .lean();
  } catch (err) {
    console.error("[lead-notes] lookup failed:", err.message);
    return {};
  }

  const byLead = {};
  for (const n of notes) {
    const k = String(n.leadId);
    (byLead[k] = byLead[k] || []).push(n);
  }
  return byLead;
};

module.exports = { getNotesForLeads };
