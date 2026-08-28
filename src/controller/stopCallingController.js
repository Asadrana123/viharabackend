// controller/stopCallingController.js
//
// Admin "stop calling" kill-switch for the daily Maya retry sweeps.
//
// A single, unified endpoint keyed by leadType + leadId (the SAME four leadType
// values the notes system uses — see leadNoteModel.LEAD_TYPES) so we don't need
// a separate route per collection. Setting callingStopped = true makes the
// matching scheduler skip that lead on every sweep; setting it back to false
// makes the lead eligible for its daily callback again.
//
// This ONLY affects the per-lead daily sweep. It does NOT cancel human-requested
// scheduled callbacks (callbackRequestModel) — those are a separate flow.
//
// Named distinctly from leadCallController.js (the public persona-1 signup
// handler) to avoid confusion — this file is admin-only call control.

const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const GeorgiaStLead = require("../model/georgiaStLeadModel");
const RensselaerAveLead = require("../model/rensselaerAveLeadModel");
const PartnerLead = require("../model/partnerLeadModel");
const PropertyLead = require("../model/propertyLeadModel");

// leadType → Mongoose model. Keys MUST match leadNoteModel.LEAD_TYPES so the
// admin UI can reuse the same leadType it already passes for notes.
const MODEL_BY_TYPE = {
  earlyAccess: EarlyAccessLead,
  georgiaSt: GeorgiaStLead,
  rensselaerAve: RensselaerAveLead,
  partner: PartnerLead,
  property: PropertyLead, // unified /auction/:slug leads
};

/**
 * PATCH /api/v1/lead-calling   { leadType, leadId, stopped }
 *
 * Toggle the daily-sweep kill-switch for one lead.
 *   stopped: true  → scheduler skips this lead (calling paused)
 *   stopped: false → scheduler resumes the daily callback for this lead
 *
 * Returns the updated flag so the UI can reflect state without a refetch.
 */
const setLeadCalling = catchAsyncError(async (req, res, next) => {
  const { leadType, leadId, stopped } = req.body;

  const Model = MODEL_BY_TYPE[leadType];
  if (!Model) return next(new ErrorHandler("Invalid leadType", 400));
  if (!leadId) return next(new ErrorHandler("leadId is required", 400));
  if (typeof stopped !== "boolean")
    return next(new ErrorHandler("stopped must be true or false", 400));

  const lead = await Model.findByIdAndUpdate(
    leadId,
    { $set: { callingStopped: stopped } },
    { new: true, projection: { callingStopped: 1 } }
  ).lean();

  if (!lead) return next(new ErrorHandler("Lead not found", 404));

  res.status(200).json({
    success: true,
    leadType,
    leadId,
    callingStopped: lead.callingStopped,
  });
});

module.exports = { setLeadCalling };
