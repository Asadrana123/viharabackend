// controller/interestedLeadController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const { sendCrossFunnelList } = require("../../services/leads/crossFunnelLeads");

// Whole-word "test" (case-insensitive). Test-named leads live only in the Test
// Leads tab, so they are dropped from this consolidated view even if warm.
const TEST_NAME_REGEX = /\btest\b/i;

// Every source collection, tagged with the note discriminator it uses and the
// label shown in the aggregated table so an advisor knows which funnel a lead
// came from. leadType MUST match the values in leadNoteModel.LEAD_TYPES so note
// edit/delete resolves against the right collection.
const SOURCES = [
  { model: EarlyAccessLead,    leadType: "earlyAccess",   label: "Early Access" },
  { model: GeorgiaStLead,      leadType: "georgiaSt",     label: "449 Georgia St" },
  { model: RensselaerAveLead,  leadType: "rensselaerAve", label: "401 Rensselaer Ave" },
  { model: PartnerLead,        leadType: "partner",       label: "Partner Program" },
  { model: BuyerListLead,    leadType: "buyerList",     label: "Buyer List" },
  { model: NewDealsLead,     leadType: "newDeals",      label: "New Deals" },
];

/**
 * GET /api/v1/interested-leads?page=&limit=&view=&id=   (limit=all → every lead)
 *
 * One consolidated view of "warm" leads across the lead collections. A lead
 * shows up here only if it either:
 *   • PICKED UP a Maya call (a human answered), or
 *   • has at least one manual advisor note.
 *
 * Rows carry `leadType` / `leadTypeLabel` so the UI knows which funnel each
 * came from. ?view=summary / ?id= work as on the single-funnel tabs.
 *
 * NOTE ON SCALE: this pulls every lead and filters in memory — fine at current
 * volume. Move to a query-level filter when the collections grow.
 */
const getInterestedLeads = catchAsyncError((req, res) =>
  sendCrossFunnelList(req, res, {
    sources: SOURCES,
    // Pickup or a note; test-named leads belong only in the Test Leads tab.
    keep: (lead) => !TEST_NAME_REGEX.test(lead.fullName || "") && (lead.pickedUp || lead.notes.length > 0),
    notesInSummary: true,
  })
);

module.exports = { getInterestedLeads };
