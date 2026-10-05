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

const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");

// leadType → Mongoose model. Keys MUST match leadNoteModel.LEAD_TYPES so the
// admin UI can reuse the same leadType it already passes for notes. Shared
// with Vtext's inbound lead-linking (sendify-infra.md §6.2) — extracted to
// services/leads/leadModelsByType.js so both call sites stay in sync. That
// map also carries the "newDeals" entry added on main during this merge.
const { MODEL_BY_TYPE } = require("../../services/leads/leadModelsByType");
const { FOLLOW_UP_DAYS, nextFollowUpAt } = require("../../services/calling/followUpCadence");

/**
 * PATCH /api/v1/lead-calling   { leadType, leadId, stopped }
 *
 * Toggle the daily-sweep kill-switch for one lead.
 *   stopped: true  → scheduler skips this lead (calling paused)
 *   stopped: false → scheduler resumes the daily callback for this lead
 *
 * PATCH /api/v1/lead-calling   { leadType, leadId, restart: true }
 *
 * For a "not-reached" lead (7 follow-up days, no pickup): start a fresh 7-day
 * window — one call a day again from tomorrow.
 *
 * Returns the updated fields so the UI can reflect state without a refetch.
 */
const setLeadCalling = catchAsyncError(async (req, res, next) => {
  const { leadType, leadId, stopped, restart } = req.body;

  const Model = MODEL_BY_TYPE[leadType];
  if (!Model) return next(new ErrorHandler("Invalid leadType", 400));
  if (!leadId) return next(new ErrorHandler("leadId is required", 400));

  if (restart === true) return restartFollowUps(Model, req, res, next);
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

/**
 * Restart a finished follow-up window. Only "not-reached" leads qualify — they
 * consented and went through the full window — so this can never start calling
 * a lead that never asked for a call.
 */
async function restartFollowUps(Model, req, res, next) {
  const { leadType, leadId } = req.body;

  const lead = await Model.findById(leadId).select("callStatus timezone").lean();
  if (!lead) return next(new ErrorHandler("Lead not found", 404));
  if (lead.callStatus !== "not-reached")
    return next(new ErrorHandler("Only leads that were not reached can be restarted", 400));

  const now = new Date();
  const updated = await Model.findByIdAndUpdate(
    leadId,
    {
      $set: {
        callStatus: "no-answer",
        followUpStartedAt: now,
        nextCallAt: nextFollowUpAt({ timezone: lead.timezone, followUpStartedAt: now }, undefined, now),
        callingStopped: false,
      },
    },
    { new: true, projection: { callStatus: 1, nextCallAt: 1, callingStopped: 1 } }
  ).lean();

  res.status(200).json({
    success: true,
    leadType,
    leadId,
    callStatus: updated.callStatus,
    nextCallAt: updated.nextCallAt,
    callingStopped: updated.callingStopped,
    followUpDays: FOLLOW_UP_DAYS,
  });
}

module.exports = { setLeadCalling };
