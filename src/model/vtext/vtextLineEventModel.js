// model/vtext/vtextLineEventModel.js
//
// Audit trail for anything that changes a line's state — status changes,
// quarantines, heartbeat loss/restore, limit edits, warm-up progression.
// Every admin action on a line (Phase 4+) writes one of these.
const mongoose = require("mongoose");

const vtextLineEventSchema = new mongoose.Schema(
  {
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel", required: true, index: true },
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

vtextLineEventSchema.index({ lineId: 1, createdAt: -1 });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextLineEventModel", vtextLineEventSchema, "sendifylineeventmodels");
