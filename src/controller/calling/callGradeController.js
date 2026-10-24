// controller/calling/callGradeController.js
//
// Admin correction of one call's grade (the outcome + score the Leads tab and
// the Slack "Interested" ping read). The grade it replaces is kept on the row.

const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const mongoose = require("mongoose");
const CallLog = require("../../model/calling/callLogModel");
const { adminGrade, gradeByRules, VERDICTS } = require("../../services/calling/callGradeService");
const { mapCallLog } = require("../../services/calling/vapiCallsService");

/**
 * PATCH /api/v1/lead-calling/calls/:callId/grade   { verdict, note? }
 * callId is the id the admin table shows (VAPI call id, or the CallLog _id).
 * verdict: no_conversation | voicemail | not_interested | not_now | callback | interested | hot
 */
const setCallGrade = catchAsyncError(async (req, res, next) => {
  const { verdict, note } = req.body || {};
  if (!VERDICTS.includes(verdict)) {
    return next(new ErrorHandler(`verdict must be one of: ${VERDICTS.join(", ")}`, 400));
  }

  const { callId } = req.params;
  const or = [{ vapiCallId: callId }];
  if (mongoose.Types.ObjectId.isValid(callId)) or.push({ _id: callId });
  const row = await CallLog.findOne({ $or: or }).lean();
  if (!row) return next(new ErrorHandler("Call not found", 404));

  const previous =
    row.grade ||
    gradeByRules({ transcript: row.transcript, endedReason: row.endedReason, durationSecs: row.durationSeconds });
  const grade = adminGrade(verdict, previous, note);
  await CallLog.updateOne({ _id: row._id }, { $set: { grade } });

  res.status(200).json({ success: true, call: mapCallLog({ ...row, grade }) });
});

module.exports = { setCallGrade };
