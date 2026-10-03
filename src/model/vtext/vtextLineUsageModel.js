// model/vtext/vtextLineUsageModel.js
//
// One record per (line, day) — mirrors callerNumberUsageModel.js exactly
// (string day key in the pool timezone, atomic $inc), extended with the
// extra counters Vtext's capacity gates need: `assigned` (reserved at
// routing time, what the daily cap is actually enforced against — see
// sendify-infra.md §4.4), `inbound` (for the reply-ratio health check), and
// `replyAssigned` (the portion of `assigned` that drew on the reply reserve
// rather than the cold-send budget).
const mongoose = require("mongoose");

const vtextLineUsageSchema = new mongoose.Schema(
  {
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel", required: true },
    day: { type: String, required: true, trim: true }, // "YYYY-MM-DD" in VTEXT_DAY_TZ

    assigned: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    inbound: { type: Number, default: 0 },
    newRecipients: { type: Number, default: 0 },
    replyAssigned: { type: Number, default: 0 },
  },
  { timestamps: true }
);

vtextLineUsageSchema.index({ lineId: 1, day: 1 }, { unique: true });
vtextLineUsageSchema.index({ day: 1 });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextLineUsageModel", vtextLineUsageSchema, "sendifylineusagemodels");
