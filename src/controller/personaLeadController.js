const PersonaLead = require("../model/personaLeadModel");
const catchAsyncError = require("../middleware/catchAsyncError");

/**
 * GET /api/v1/persona-lead?page=&limit=
 * Paginated list for the admin Persona Leads tab.
 */
const getAllPersonaLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    PersonaLead.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PersonaLead.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    leads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getAllPersonaLeads };