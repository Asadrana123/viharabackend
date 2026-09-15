// model/callerNumberUsageModel.js
const mongoose = require("mongoose");

/**
 * One record per (caller number, day) — how many outbound calls a given VAPI
 * phone number has placed on a given day. This is what powers caller-ID
 * rotation ("least-used-today") and the per-number daily cap.
 *
 * Why a dedicated collection instead of counting callLogModel:
 *   • callLogModel is written at END of call (from VAPI's end-of-call webhook)
 *     and does not record WHICH number placed the call, so it can't answer
 *     "which of my numbers is least used today" at dial time.
 *   • This counter is incremented at DIAL time and lives in Mongo, so the
 *     rotation state survives Render restarts (no in-memory counters to lose).
 *
 * `day` is a plain "YYYY-MM-DD" string in the pool timezone (see
 * callerNumberPoolService). Keeping it a string makes the unique key trivial
 * and avoids timezone drift from Date objects.
 */
const callerNumberUsageSchema = new mongoose.Schema(
  {
    // VAPI phone number id (the id VAPI uses in the /call `phoneNumberId` field).
    phoneNumberId: { type: String, required: true, trim: true },

    // Local calendar day in the pool timezone, "YYYY-MM-DD".
    day: { type: String, required: true, trim: true },

    // Calls placed from this number on this day.
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One row per number per day + fast lookups for the whole pool on a given day.
callerNumberUsageSchema.index({ phoneNumberId: 1, day: 1 }, { unique: true });
callerNumberUsageSchema.index({ day: 1 });

module.exports = mongoose.model("callerNumberUsageModel", callerNumberUsageSchema);
