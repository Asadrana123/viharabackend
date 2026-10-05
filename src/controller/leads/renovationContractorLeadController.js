// controller/leads/renovationContractorLeadController.js
//
// Admin — Renovation Contractors/Vendors Leads tab. Lists submissions from
// the renovation tool's "Get Contractors & Vendors" button
// (renovationContractorRequestModel). Flat list across every property
// (not property-picker-gated) so an admin can see everything pending in one
// place — same shape as earlyAccessLeadController's admin list, minus the
// calls/email-events enrichment (this lead type has no Maya calling or
// email flow attached to it — see leadSources.config.js hasCalls/hasComms).

const catchAsyncError = require("../../middleware/catchAsyncError");
const RenovationContractorRequest = require("../../model/property/renovationContractorRequestModel");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");

// Discriminator stamped on each note so notes never bleed across lead types.
// MUST match leadNoteModel.LEAD_TYPES.
const LEAD_NOTE_TYPE = "renovationContractor";
// Whole-word "test" (case-insensitive) — same convention as every other lead
// tab; leads whose name matches are hidden here and only ever show up if a
// future "Test" tab enumeration is extended to include this source.
const TEST_NAME_REGEX = /\btest\b/i;

/**
 * GET /api/v1/renovation-contractor-leads?page=&limit=
 */
const getAllRenovationContractorLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const query = { name: { $not: TEST_NAME_REGEX } };
  const [leads, total] = await Promise.all([
    RenovationContractorRequest.find(query)
      .populate("propertyId", "productName street city state slug")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RenovationContractorRequest.countDocuments(query),
  ]);

  const leadIds = leads.map((l) => l._id);
  const notesByLead = await getNotesForLeads(LEAD_NOTE_TYPE, leadIds);

  const leadsWithNotes = leads.map((lead) => {
    const property = lead.propertyId && typeof lead.propertyId === "object" ? lead.propertyId : null;
    return {
      ...lead,
      // The admin leads table's Name column only ever reads `fullName` (or
      // firstName/lastName) — alias it here rather than rename the model's
      // own `name` field.
      fullName: lead.name,
      propertyId: property?._id || lead.propertyId,
      propertyName: property?.productName || "",
      propertyAddress: property ? [property.street, property.city, property.state].filter(Boolean).join(", ") : "",
      notes: notesByLead[String(lead._id)] || [],
    };
  });

  res.status(200).json({
    success: true,
    leads: leadsWithNotes,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getAllRenovationContractorLeads };
