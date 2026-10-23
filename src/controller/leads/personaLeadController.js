const PersonaLead = require("../../model/leads/personaLeadModel");
const catchAsyncError = require("../../middleware/catchAsyncError");
const { listView, scopeQuery, listSelect, shapeLeads } = require("../../services/leads/leadListView");

/**
 * GET /api/v1/persona-lead?page=&limit=&view=&id=
 * Paginated list for the admin Persona Leads tab (?view=summary / ?id= as in
 * leadListView).
 */
const getAllPersonaLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req);
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const [leads, total] = await Promise.all([
    PersonaLead.find(scopeQuery(view, {})).select(listSelect(view)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PersonaLead.countDocuments(scopeQuery(view, {})),
  ]);

  res.status(200).json({
    success: true,
    leads: shapeLeads(view, leads),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getAllPersonaLeads };