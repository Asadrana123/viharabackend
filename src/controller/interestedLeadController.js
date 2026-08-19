// controller/interestedLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const GeorgiaStLead = require("../model/georgiaStLeadModel");
const RensselaerAveLead = require("../model/rensselaerAveLeadModel");
const PartnerLead = require("../model/partnerLeadModel");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");
const { getEmailEventsForEmails } = require("../services/emailEventsService");
const { getNotesForLeads } = require("../services/leadNotesService");

// A "pickup" = a human actually answered. Same set the per-tab UI uses for its
// "Pickup" filter (positive / negative / callback). Voicemail + missed are NOT
// pickups.
const PICKUP_OUTCOMES = new Set(["positive", "negative", "callback"]);

// Every source collection, tagged with the note discriminator it uses and the
// label shown in the aggregated table so an advisor knows which funnel a lead
// came from. leadType MUST match the values in leadNoteModel.LEAD_TYPES so note
// edit/delete resolves against the right collection.
const SOURCES = [
  { model: EarlyAccessLead,    leadType: "earlyAccess",   label: "Early Access" },
  { model: GeorgiaStLead,      leadType: "georgiaSt",     label: "449 Georgia St" },
  { model: RensselaerAveLead,  leadType: "rensselaerAve", label: "401 Rensselaer Ave" },
  { model: PartnerLead,        leadType: "partner",       label: "Partner Program" },
];

/**
 * GET /api/v1/interested-leads?page=&limit=
 *
 * One consolidated view of "warm" leads across ALL four lead collections. A lead
 * shows up here only if it either:
 *   • PICKED UP a Maya call (a human answered), or
 *   • has at least one manual advisor note.
 *
 * Each row carries its calls, notes and email events (same shape as the
 * individual lead tabs) plus `leadType` / `leadTypeLabel` so the UI knows which
 * funnel it came from and can edit notes against the right collection.
 *
 * NOTE ON SCALE: like the existing per-tab endpoints this pulls every lead and
 * filters in memory — fine at current volume. Move to a query-level filter when
 * the collections grow.
 */
const getInterestedLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

  // ── 1. Resolve each collection independently (calls + emails + notes) ─────
  const perSource = await Promise.all(
    SOURCES.map(async ({ model, leadType, label }) => {
      const leads = await model.find().sort({ createdAt: -1 }).lean();

      const phones = leads.map((l) => l.phone).filter(Boolean);
      const emailAddresses = leads.map((l) => l.email).filter(Boolean);
      const leadIds = leads.map((l) => l._id);

      const [callsByPhone, eventsByEmail, notesByLead] = await Promise.all([
        getCallsForPhones(phones),
        getEmailEventsForEmails(emailAddresses),
        getNotesForLeads(leadType, leadIds),
      ]);

      return leads.map((lead) => {
        // Unify partner (firstName + lastName) with the rest (fullName).
        const fullName =
          lead.fullName ||
          [lead.firstName, lead.lastName].filter(Boolean).join(" ");

        return {
          ...lead,
          fullName,
          leadType,                   // drives note edit/delete on the right collection
          leadTypeLabel: label,       // human label for the Source column
          calls: callsByPhone[normalisePhone(lead.phone)] || [],
          emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
          notes: notesByLead[String(lead._id)] || [],
        };
      });
    })
  );

  // ── 2. Flatten + keep only interested leads (picked up OR has a note) ─────
  const interested = perSource.flat().filter((lead) => {
    const pickedUp = lead.calls.some((c) => PICKUP_OUTCOMES.has(c.outcome));
    const hasNotes = lead.notes.length > 0;
    return pickedUp || hasNotes;
  });

  // ── 3. Newest activity first — latest call, else when the lead came in ────
  const activityAt = (lead) => {
    const latest = lead.calls[0]; // calls are newest-first
    const callTs = latest?.startedAt ? new Date(latest.startedAt).getTime() : 0;
    const createdTs = lead.createdAt ? new Date(lead.createdAt).getTime() : 0;
    return Math.max(callTs, createdTs);
  };
  interested.sort((a, b) => activityAt(b) - activityAt(a));

  // ── 4. Paginate the combined, filtered list ───────────────────────────────
  const total = interested.length;
  const start = (page - 1) * limit;
  const pageLeads = interested.slice(start, start + limit);

  res.status(200).json({
    success: true,
    leads: pageLeads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getInterestedLeads };
