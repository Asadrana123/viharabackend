// controller/leadNoteController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const LeadNote = require("../model/leadNoteModel");
const { LEAD_TYPES } = require("../model/leadNoteModel");

/**
 * GET /api/v1/lead-notes/whoami
 * Returns the current advisor. (Kept for convenience; the UI no longer needs it
 * now that any logged-in admin may edit/delete any note.)
 */
const whoami = catchAsyncError(async (req, res) => {
  res.status(200).json({ success: true, advisor: req.advisor });
});

/**
 * POST /api/v1/lead-notes   { leadType, leadId, text }
 * Adds a note to a lead. Author is taken from the logged-in advisor — never from
 * the request body — so the "who wrote this" record can't be spoofed.
 */
const addNote = catchAsyncError(async (req, res, next) => {
  const { leadType, leadId, text } = req.body;

  if (!LEAD_TYPES.includes(leadType))
    return next(new ErrorHandler("Invalid leadType", 400));
  if (!leadId) return next(new ErrorHandler("leadId is required", 400));
  if (!text || !text.trim())
    return next(new ErrorHandler("Note text is required", 400));

  const note = await LeadNote.create({
    leadType,
    leadId,
    advisorId: req.advisor.id,
    advisorName: req.advisor.name,
    text: text.trim(),
  });

  res.status(201).json({ success: true, note });
});

/**
 * PATCH /api/v1/lead-notes/:id   { text }
 * Edits a note. Any logged-in admin may edit any note.
 */
const updateNote = catchAsyncError(async (req, res, next) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return next(new ErrorHandler("Note text is required", 400));

  const note = await LeadNote.findById(req.params.id);
  if (!note) return next(new ErrorHandler("Note not found", 404));

  note.text = text.trim();
  await note.save();

  res.status(200).json({ success: true, note });
});

/**
 * DELETE /api/v1/lead-notes/:id
 * Deletes a note. Any logged-in admin may delete any note.
 */
const deleteNote = catchAsyncError(async (req, res, next) => {
  const note = await LeadNote.findById(req.params.id);
  if (!note) return next(new ErrorHandler("Note not found", 404));

  await note.deleteOne();

  res.status(200).json({ success: true, id: req.params.id });
});

module.exports = { whoami, addNote, updateNote, deleteNote };
