// model/sendify/sendifyLineUsageModel.js
//
// One record per (line, day) — mirrors callerNumberUsageModel.js exactly
// (string day key in the pool timezone, atomic $inc), extended with the
// extra counters Sendify's capacity gates need: `assigned` (reserved at
// routing time, what the daily cap is actually enforced against — see
// sendify-infra.md §4.4), `inbound` (for the reply-ratio health check), and
// `replyAssigned` (the portion of `assigned` that drew on the reply reserve
// rather than the cold-send budget).
const mongoose = require("mongoose");

const sendifyLineUsageSchema = new mongoose.Schema(
  {
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel", required: true },
    day: { type: String, required: true, trim: true }, // "YYYY-MM-DD" in SENDIFY_DAY_TZ

    assigned: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    inbound: { type: Number, default: 0 },
    newRecipients: { type: Number, default: 0 },
    replyAssigned: { type: Number, default: 0 },
  },
  { timestamps: true }
);

sendifyLineUsageSchema.index({ lineId: 1, day: 1 }, { unique: true });
sendifyLineUsageSchema.index({ day: 1 });

module.exports = mongoose.model("sendifyLineUsageModel", sendifyLineUsageSchema);
