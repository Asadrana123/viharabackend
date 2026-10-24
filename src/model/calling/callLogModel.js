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
    // How Maya reached them: a normal phone call, or a FaceTime audio call (FaceTime test).
    channel: { type: String, enum: ["phone", "facetime"], default: "phone" },

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

    // Our own grade of the call (callGradeService): outcome + 0-100 score, set
    // when the end-of-call report arrives. `by` is "ai" or "rules"; null on rows
    // saved before grading existed (those fall back to the rules on read).
    grade: {
      type: new mongoose.Schema(
        {
          outcome: String, // missed | voicemail | negative | callback | positive
          verdict: String, // Claude's finer label (not_now, hot, …); null for rules
          score: Number,
          reason: String,
          signals: { type: mongoose.Schema.Types.Mixed, default: null },
          by: String, // "ai" | "rules" | "admin"
          version: Number,
          gradedAt: Date,
          // On an admin correction: the grade it replaced (Claude's or the rules').
          replaced: { type: mongoose.Schema.Types.Mixed, default: null },
        },
        { _id: false }
      ),
      default: null,
    },

    // Timing / cost.
    durationSeconds: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    cost: { type: Number, default: 0 },

    // Notifications. Set the first time we post this "interested" call to Slack,
    // so a re-delivered end-of-call webhook can never trigger a duplicate ping.
    // Null = not yet notified; used as the atomic claim in callLogService.
    interestedSlackNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// "Everything we know about this phone number, newest first" — the memory read.
callLogSchema.index({ phone: 1, createdAt: -1 });

// Fast dedupe / lookup by VAPI call id.
callLogSchema.index({ vapiCallId: 1 });

module.exports = mongoose.model("callLogModel", callLogSchema);
