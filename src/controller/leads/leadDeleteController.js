// controller/leads/leadDeleteController.js
//
// Admin hard-delete for one lead from any lead tab, keyed by the same leadType
// values the notes / calling-control endpoints use.
//
// Removes the lead itself plus what hangs off it by (leadType, leadId): its
// advisor notes and Vtext's back-link to it. Call logs, emails and texts are
// keyed by phone / email (not by lead), so they stay — the person's history is
// still there if they sign up again.

const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const { ALL_LEAD_SOURCES } = require("../../services/leads/leadModelsByType");
const LeadNote = require("../../model/leads/leadNoteModel");
const VtextContact = require("../../model/vtext/vtextContactModel");

/** DELETE /api/v1/admin-leads/:leadType/:leadId */
const deleteLead = catchAsyncError(async (req, res, next) => {
  const { leadType, leadId } = req.params;

  const Model = ALL_LEAD_SOURCES[leadType]?.model;
  if (!Model) return next(new ErrorHandler("Invalid leadType", 400));

  const lead = await Model.findByIdAndDelete(leadId).lean();
  if (!lead) return next(new ErrorHandler("Lead not found", 404));

  await Promise.all([
    LeadNote.deleteMany({ leadType, leadId: lead._id }),
    VtextContact.updateMany(
      { "leadRefs.leadId": lead._id },
      { $pull: { leadRefs: { leadType, leadId: lead._id } } }
    ),
  ]);

  res.status(200).json({ success: true, leadType, leadId });
});

module.exports = { deleteLead };
