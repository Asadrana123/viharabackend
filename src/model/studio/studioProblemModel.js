// model/studio/studioProblemModel.js
const mongoose = require("mongoose");

/** A problem someone reported in the Video Studio, in their words, and how an admin answered it. */
const problemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true },
    byName: { type: String, required: true },
    text: { type: String, required: true },
    // The video it is about, when there is one, e.g. CH703-V05.
    video: { type: String, default: "" },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    reply: { type: String, default: "" },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioProblem", problemSchema);
