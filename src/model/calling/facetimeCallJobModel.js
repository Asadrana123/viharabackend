// model/calling/facetimeCallJobModel.js
//
// One FaceTime audio call Maya should place through a Mac (FaceTime test).
// The backend creates the job, the Mac agent picks it up, dials, and reports
// back. Only when the person answers does the backend open a Vapi websocket
// call, so a ring-out costs nothing on Vapi. If the Mac never got the call
// ringing, the same job falls back to a normal Vapi phone call.
//
// The id doubles as the call id the existing schedulers poll (prefixed
// "ft_", see facetimeCallService.FACETIME_CALL_PREFIX), so they keep working
// unchanged whichever way the call actually went out.
const mongoose = require("mongoose");

// Waiting on the Mac, then the call itself, then a final state.
const JOB_STATUSES = [
  "queued",     // created, waiting for the Mac to pick it up
  "claimed",    // the Mac picked it up
  "dialing",    // the Mac opened FaceTime and is dialing
  "ringing",    // the person's phone is ringing (from here on, it counts as a real call)
  "answered",   // they picked up and Maya is on the line
  "ended",      // an answered call finished
  "no-answer",  // rang, nobody picked up
  "declined",   // they declined the FaceTime call
  "failed",     // went wrong after it rang, or the phone fallback also failed
  "fell-back",  // never rang, so a normal Vapi phone call went out instead
];
const ACTIVE_STATUSES = ["queued", "claimed", "dialing", "ringing", "answered"];
const NEVER_RANG_STATUSES = ["queued", "claimed", "dialing"];

const facetimeCallJobSchema = new mongoose.Schema(
  {
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel", required: true, index: true },
    phone: { type: String, required: true, trim: true }, // E.164, what the Mac dials
    fullName: { type: String, default: "", trim: true },
    source: { type: String, default: "", trim: true },

    status: { type: String, enum: JOB_STATUSES, default: "queued", index: true },

    // Everything needed to start Maya later, built at queue time by dispatchCall:
    // same prompt, memory and metadata as a normal call.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    assistantOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Set once Maya is actually on a call: the websocket call (answered) or the
    // phone call (fell back). Pollers read the real Vapi call through this.
    vapiCallId: { type: String, default: "" },
    channelUsed: { type: String, enum: ["facetime", "phone", null], default: null },

    queuedAt: { type: Date, default: Date.now },
    claimedAt: { type: Date },
    dialingAt: { type: Date },
    ringingAt: { type: Date },
    answeredAt: { type: Date },
    finishedAt: { type: Date },
    failureReason: { type: String, default: "" },

    events: [
      {
        status: { type: String },
        at: { type: Date, default: Date.now },
        note: { type: String, default: "" },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

facetimeCallJobSchema.index({ lineId: 1, status: 1, queuedAt: 1 });
facetimeCallJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model("facetimeCallJobModel", facetimeCallJobSchema);
module.exports.JOB_STATUSES = JOB_STATUSES;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.NEVER_RANG_STATUSES = NEVER_RANG_STATUSES;
