// controller/testLeadController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const RenovationContractorRequest = require("../../model/property/renovationContractorRequestModel");
const { sendCrossFunnelList } = require("../../services/leads/crossFunnelLeads");

// Whole-word "test" (case-insensitive): matches "test", "Test User", "John Test",
// but NOT "Testerson" or "contest". Kept identical to the exclusion regex used by
// every other lead list so a lead is in exactly one place.
const TEST_NAME_REGEX = /\btest\b/i;

// Same source collections + labels the Interested Leads tab uses. leadType MUST
// match the values in leadNoteModel.LEAD_TYPES so note edit/delete resolves
// against the right collection.
const SOURCES = [
  { model: EarlyAccessLead,             leadType: "earlyAccess",         label: "Early Access" },
  { model: GeorgiaStLead,               leadType: "georgiaSt",           label: "449 Georgia St" },
  { model: RensselaerAveLead,           leadType: "rensselaerAve",       label: "401 Rensselaer Ave" },
  { model: PartnerLead,                 leadType: "partner",             label: "Partner Program" },
  { model: BuyerListLead,    leadType: "buyerList",     label: "Buyer List" },
  { model: NewDealsLead,     leadType: "newDeals",      label: "New Deals" },
  { model: RenovationContractorRequest, leadType: "renovationContractor", label: "Renovation Contractors/Vendors" },
];

/**
 * GET /api/v1/test-leads?page=&limit=&view=&id=   (limit=all → every lead)
 *
 * One consolidated view of every lead whose name contains the whole word "test",
 * across the lead collections. These leads are excluded from every other lead
 * tab, so this is the single place they surface. ?view=summary / ?id= work as
 * on the single-funnel tabs.
 *
 * NOTE ON SCALE: like the Interested Leads endpoint this pulls every lead and
 * filters in memory — fine at current volume. Move to a query-level filter when
 * the collections grow.
 */
const getTestLeads = catchAsyncError((req, res) =>
  sendCrossFunnelList(req, res, {
    sources: SOURCES,
    keep: (lead) => TEST_NAME_REGEX.test(lead.fullName || ""),
  })
);

module.exports = { getTestLeads };
