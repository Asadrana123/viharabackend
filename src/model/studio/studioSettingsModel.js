// model/studio/studioSettingsModel.js
const mongoose = require("mongoose");

/**
 * Video Studio settings an admin changes in the Studio. One document per `key`; today only
 * "interview": the interview's questions (config/studio/interviewQuestions.js are the defaults).
 */
const questionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true },
    usable: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const studioSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    questions: { type: [questionSchema], default: [] },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioSettings", studioSettingsSchema);
