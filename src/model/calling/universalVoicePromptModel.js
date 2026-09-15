const mongoose = require("mongoose");

const universalVoicePromptSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "universal", unique: true, index: true },
    systemPrompt: {
      type: String,
      required: [true, "systemPrompt is required"],
      trim: true,
    },
    firstMessage: { type: String, default: "", trim: true, maxlength: 1000 },
    voicemailMessage: { type: String, default: "", trim: true, maxlength: 1000 },
    endCallMessage: { type: String, default: "", trim: true, maxlength: 1000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("universalVoicePromptModel", universalVoicePromptSchema);