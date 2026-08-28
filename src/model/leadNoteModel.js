// model/leadNoteModel.js
const mongoose = require("mongoose");

// The lead collections notes can attach to. Stored on every note so notes never
// bleed across lead types even though lead _ids come from separate collections.
// "property" is the unified /auction/:slug lead collection (propertyLeadModel).
const LEAD_TYPES = ["earlyAccess", "georgiaSt", "rensselaerAve", "partner", "property"];

/**
 * A single advisor note on a lead. Many advisors can add many notes to the same
 * lead — each is its own row, so there is never a write conflict.
 *
 * advisorName is a SNAPSHOT of the author's name at write time, so the note
 * always shows who wrote it even if that admin's record later changes. advisorId
 * is the source of truth for the "only the author can edit/delete" check.
 */
const leadNoteSchema = new mongoose.Schema(
  {
    leadType: { type: String, required: true, enum: LEAD_TYPES },
    leadId: { type: mongoose.Schema.Types.ObjectId, required: true },

    advisorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    advisorName: { type: String, default: "", trim: true },

    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// The admin leads join: "all notes for these leads of this type, newest first."
leadNoteSchema.index({ leadType: 1, leadId: 1, createdAt: -1 });

module.exports = mongoose.model("leadNoteModel", leadNoteSchema);
module.exports.LEAD_TYPES = LEAD_TYPES;
