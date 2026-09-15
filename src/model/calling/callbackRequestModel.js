// model/callbackRequestModel.js
//
// A callback the CALLER asked for during a live call ("call me back in 10
// minutes" / "call me at 5pm"). Maya schedules it via the scheduleCallback
// tool; the webhook writes one of these; voiceCallbackScheduler dials it.
//
// State lives here (not in a setTimeout) so a pending callback survives a
// Render restart — same principle as the per-lead schedulers.
//
//   callAt      → the exact time the caller asked for (first dial).
//   nextCallAt  → the time the sweeper should dial next. Starts equal to
//                 callAt; after a no-answer it moves to the next 1:32 PM local
//                 so the request falls into the normal daily retry loop.
//   status      → pending  : still owed a call
//                 connected: a human picked up — done
//                 cancelled: an admin cancelled it
//                 failed   : gave up (kept for completeness; not used yet)

const mongoose = require("mongoose");

const callbackRequestSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "" },
    phone: { type: String, required: true, index: true }, // E.164, as VAPI gave it
    email: { type: String, default: "" },

    // Which property this call was pitching, so the callback re-uses the same
    // prompt. Null for generic flows (e.g. early access) — see promptConfig.
    propertyId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // Snapshot of the prompt to speak on the callback, resolved when the request
    // is created. Stored inline so the sweeper needs no extra lookup and the
    // callback still works even if the prompt is edited later.
    promptConfig: {
      systemPrompt: { type: String, default: "" },
      firstMessage: { type: String, default: "" },
      voicemailMessage: { type: String, default: "" },
      endCallMessage: { type: String, default: "" },
    },

    source: { type: String, default: "human-requested-callback" },
    note: { type: String, default: "" },
    timezone: { type: String, default: "" }, // used only for the 1:32 PM retries

    requestedDelayMinutes: { type: Number, default: null },
    callAt: { type: Date, required: true },
    nextCallAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["pending", "connected", "cancelled", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    lastCallAt: { type: Date, default: null },

    sourceCallId: { type: String, default: "" }, // the VAPI call it was asked on
  },
  { timestamps: true }
);

// The sweeper's hot query: pending + due.
callbackRequestSchema.index({ status: 1, nextCallAt: 1 });

module.exports = mongoose.model("CallbackRequest", callbackRequestSchema);
