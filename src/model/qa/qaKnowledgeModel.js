// model/qa/qaKnowledgeModel.js
//
// Facts the QA agent remembers between runs so it doesn't ask the admin the
// same thing twice — e.g. "team_test_phone" → "+1 ...", or a business rule
// like "stop_calling_also_stops_sms" → "yes". Written when an admin answers a
// question marked `remember`, or added/edited by an admin directly.
const mongoose = require("mongoose");

const qaKnowledgeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    value: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true }, // the original question, for context
    source: { type: String, enum: ["answer", "admin"], default: "answer" },
    sourceRunId: { type: mongoose.Schema.Types.ObjectId },
    updatedByName: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("qaKnowledgeModel", qaKnowledgeSchema);
