// model/adminAsk/adminAskConversationModel.js
//
// One admin "Ask AI" chat. Two views of the same conversation:
//   messagesJson  the exact Claude API message history (user turns, assistant
//                 content incl. thinking + tool_use blocks, tool_result turns),
//                 replayed on every follow-up so Claude remembers what "them"
//                 or "that property" refers to. Stored as a JSON string because
//                 tool inputs carry Mongo operators ($gte, $in…) as keys, which
//                 don't round-trip cleanly as stored field names. It is only
//                 ever appended to — editing past turns invalidates thinking.
//   turns         the question/answer pairs the frontend renders.
const mongoose = require("mongoose");

const turnSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, default: "" },
    references: { type: [mongoose.Schema.Types.Mixed], default: [] },
    toolCalls: { type: Number, default: 0 },
    askedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const adminAskConversationSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true, index: true },
    title: { type: String, default: "", trim: true },
    messagesJson: { type: String, default: "[]" },
    turns: { type: [turnSchema], default: [] },
    // Running token totals, for keeping an eye on cost.
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
      cacheWriteTokens: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

adminAskConversationSchema.index({ adminId: 1, updatedAt: -1 });

module.exports = mongoose.model("adminAskConversationModel", adminAskConversationSchema);
