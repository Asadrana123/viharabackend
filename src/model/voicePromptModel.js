const mongoose = require("mongoose");

/**
 * One voice prompt per property. The admin authors these from the
 * Voice Agent → Prompt tab; calls refuse to dispatch without one.
 */
const voicePromptSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "productModel",
      required: [true, "propertyId is required"],
      unique: true,
      index: true,
    },

    // Full system prompt handed to the model on every call.
    systemPrompt: {
      type: String,
      required: [true, "systemPrompt is required"],
      trim: true,
      maxlength: [20000, "systemPrompt cannot exceed 20000 characters"],
    },

    // Spoken before the model takes over. Blank = assistant default.
    firstMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "firstMessage cannot exceed 1000 characters"],
    },

    // Left on an answering machine.
    voicemailMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "voicemailMessage cannot exceed 1000 characters"],
    },

    // Spoken immediately before the call is terminated.
    endCallMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "endCallMessage cannot exceed 1000 characters"],
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userModel",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("voicePromptModel", voicePromptSchema);
