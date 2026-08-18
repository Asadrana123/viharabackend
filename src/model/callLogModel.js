// model/callLogModel.js
const mongoose = require("mongoose");

/**
 * One record per completed Maya call, written from VAPI's `end-of-call-report`
 * webhook. This is the memory store: every future feature that needs to know
 * "what happened last time we spoke" reads from here, keyed by `phone`.
 *
 * `vapiCallId` deduplicates — a re-delivered webhook upserts the same row
 * instead of creating a duplicate (handled in callLogService).
 *
 * `structuredData` / `successEvaluation` hold whatever VAPI's analysis plan
 * returns (configured in the VAPI dashboard). They are intentionally flexible
 * (Mixed) so new analysis fields land here without a schema change.
 */
const callLogSchema = new mongoose.Schema(
  {
    // Memory key — the person we spoke to.
    phone: { type: String, required: true, trim: true },
    fullName: { type: String, default: "", trim: true },

    // Context this call came from.
    propertyId: { type: String, default: null },
    source: { type: String, default: "", trim: true },

    // VAPI identifier for this call.
    vapiCallId: { type: String, default: "", trim: true },

    // Outcome.
    endedReason: { type: String, default: "" },
    summary: { type: String, default: "" },
    transcript: { type: String, default: "" },
    recordingUrl: { type: String, default: "" },

    // Whatever the VAPI analysis plan returns (flexible, may be null).
    structuredData: { type: mongoose.Schema.Types.Mixed, default: null },
    successEvaluation: { type: mongoose.Schema.Types.Mixed, default: null },

    // Timing / cost.
    durationSeconds: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    cost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// "Everything we know about this phone number, newest first" — the memory read.
callLogSchema.index({ phone: 1, createdAt: -1 });

// Fast dedupe / lookup by VAPI call id.
callLogSchema.index({ vapiCallId: 1 });

module.exports = mongoose.model("callLogModel", callLogSchema);
