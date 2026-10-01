// model/sendify/sendifyLineEventModel.js
//
// Audit trail for anything that changes a line's state — status changes,
// quarantines, heartbeat loss/restore, limit edits, warm-up progression.
// Every admin action on a line (Phase 4+) writes one of these.
const mongoose = require("mongoose");

const sendifyLineEventSchema = new mongoose.Schema(
  {
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel", required: true, index: true },
    type: {
      type: String,
      enum: [
        "status-change", "quarantine", "heartbeat-lost", "heartbeat-restored",
        "limits-changed", "warmup-advanced",
      ],
      required: true,
    },
    from: { type: String },
    to: { type: String },
    reason: { type: String },
    actor: {
      kind: { type: String, enum: ["system", "admin"] },
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String },
    },
    metrics: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

sendifyLineEventSchema.index({ lineId: 1, createdAt: -1 });

module.exports = mongoose.model("sendifyLineEventModel", sendifyLineEventSchema);
