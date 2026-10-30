// model/studio/editorProfileModel.js
const mongoose = require("mongoose");

/**
 * A video editor's profile in the Video Studio (vihara.ai/studio): their interview answers, each
 * kept word for word with the date, and their notes after each video. Nothing here is written by
 * Claude: Claude only decides whether to ask one follow-up question; the editor's own text is
 * what is stored. An answer is never overwritten: an edit adds a new dated entry.
 *
 * The Creative OS reads these profiles from the database into learning/video-editors.md, which
 * its agents read before every video.
 */

const entrySchema = new mongoose.Schema(
  {
    // The editor's words, as typed.
    text: { type: String, required: true },
    // answer: the first reply; follow-up: the reply to the one follow-up; edit: changed later.
    kind: { type: String, enum: ["answer", "follow-up", "edit"], required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, enum: ["open", "answered", "skipped"], default: "open" },
    entries: { type: [entrySchema], default: [] },
  },
  { _id: false }
);

const turnSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["interviewer", "editor"], required: true },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    // Property and video, e.g. "1405-tamarack-ave-atwater V01". Free text.
    video: { type: String, default: "", trim: true },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const editorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true, unique: true },
    // The name answers are credited to (learning/video-editors.md, "### <name>, started <date>").
    name: { type: String, required: true, trim: true, maxLength: 40 },
    startedAt: { type: Date, default: Date.now },
    interviewedAt: { type: Date, default: null },
    // "claude-code" when an admin imported an interview taken in Claude Code.
    importedFrom: { type: String, default: null },
    sections: { type: [sectionSchema], default: [] },
    interview: {
      state: { type: String, enum: ["not_started", "in_progress", "done"], default: "not_started" },
      // Index into the questions of the section being asked.
      index: { type: Number, default: 0 },
      // True while waiting for the reply to a follow-up: only one is asked per section.
      followupAsked: { type: Boolean, default: false },
      transcript: { type: [turnSchema], default: [] },
    },
    notes: { type: [noteSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EditorProfile", editorProfileSchema);
