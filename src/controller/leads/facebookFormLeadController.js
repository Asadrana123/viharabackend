// controller/leads/facebookFormLeadController.js
//
// Admin → Leads → "Facebook Forms": Facebook / Instagram instant-form leads
// (saved by services/leads/facebookFormLeadService.js from Zernio's
// lead.received webhook), with their Maya calls, email events and notes —
// the same view as the New Deals tab.

const catchAsyncError = require("../../middleware/catchAsyncError");
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { normalisePhone, getCallsForPhones } = require("../../services/calling/vapiCallsService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, shapeLeads } = require("../../services/leads/leadListView");

const LEAD_NOTE_TYPE = "facebookForm"; // matches leadNoteModel.LEAD_TYPES

/**
 * GET /api/v1/facebook-leads?page=&limit=&formId=   (admin)
 * Newest first. ?view=summary for light rows, ?id= for one full lead.
 */
const getAllFacebookFormLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req);
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const query = {};
  if (typeof req.query.formId === "string" && req.query.formId) query.formId = req.query.formId;

  const [leads, total, forms] = await Promise.all([
    FacebookFormLead.find(scopeQuery(view, query)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    FacebookFormLead.countDocuments(scopeQuery(view, query)),
    // The forms seen so far, for the tab's filter.
    FacebookFormLead.aggregate([{ $group: { _id: "$formId", name: { $last: "$formName" }, leads: { $sum: 1 } } }, { $sort: { leads: -1 } }]),
  ]);

  const [callsByPhone, eventsByEmail, notesByLead] = await Promise.all([
    getCallsForPhones(leads.map((l) => l.phone).filter(Boolean)),
    getEmailEventsForEmails(unlessSummary(view, leads.map((l) => l.email).filter(Boolean))),
    getNotesForLeads(LEAD_NOTE_TYPE, unlessSummary(view, leads.map((l) => l._id))),
  ]);

  res.status(200).json({
    success: true,
    leads: shapeLeads(view, leads.map((lead) => ({
      ...lead,
      fullName: lead.fullName || lead.firstName,
      calls: callsByPhone[normalisePhone(lead.phone)] || [],
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
    }))),
    forms: forms.map((f) => ({ formId: f._id, name: f.name, leads: f.leads })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getAllFacebookFormLeads };
