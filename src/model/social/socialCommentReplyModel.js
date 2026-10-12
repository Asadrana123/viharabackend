const mongoose = require("mongoose");

// One row per Facebook/Instagram comment the auto-reply has seen. The unique
// commentId stops Meta's webhook retries from replying twice, and the row is
// also the log of what the AI said (or why it stayed quiet).
const socialCommentReplySchema = new mongoose.Schema(
  {
    commentId: { type: String, required: true, unique: true, index: true },
    platform: { type: String, enum: ["facebook", "instagram"], required: true },
    postId: { type: String, default: "" },
    authorId: { type: String, default: "" },
    authorName: { type: String, default: "" },
    commentText: { type: String, default: "" },
    // pending → replied | skipped | failed
    status: {
      type: String,
      enum: ["pending", "replied", "skipped", "failed"],
      default: "pending",
    },
    replyText: { type: String, default: "" },
    replyId: { type: String, default: "" },
    skipReason: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("socialCommentReplyModel", socialCommentReplySchema);
