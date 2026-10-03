// model/calling/matchCallCampaignModel.js
//
// One admin-started Buyer Match call schedule: "call this buyer about this
// property twice a day until they pick up" (see services/buyerMatch/
// matchCallService.js). At most ONE active schedule per phone number — starting
// a new one ends (replaces) the old one, and while it runs the person's routine
// sign-up follow-up calls are skipped (callDispatchQueue takeover gate).
const mongoose = require("mongoose");

const END_REASONS = [
  "connected",        // a human picked up — goal reached
  "max-days",         // ran out of days without a pickup
  "property-closed",  // property sold / auction over
  "admin-stopped",    // an admin pressed Stop
  "replaced",         // another Buyer Match schedule took over this number
  "no-phone",         // the lead has no dialable number
];

const callSchema = new mongoose.Schema(
  {
    callId: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    connected: { type: Boolean, default: null }, // null until the call ends
    error: { type: String, default: "" },
  },
  { _id: false }
);

const matchCallCampaignSchema = new mongoose.Schema(
  {
    // Who — a lead from any Buyer Match source (see buyerMatch/profiles SOURCES).
    leadType: { type: String, required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: "" },
    phone: { type: String, required: true, index: true }, // E.164, via normalisePhone
    email: { type: String, default: "" },
    timezone: { type: String, default: "" }, // IANA zone the call times are in

    // What we pitch, and why (snapshot at start so the script stays stable).
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", required: true, index: true },
    propertyLabel: { type: String, default: "" },
    match: {
      score: { type: Number, default: null },
      reasons: { type: [String], default: [] },
      concerns: { type: [String], default: [] },
      wants: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Lifecycle
    status: { type: String, enum: ["active", "ended"], default: "active", index: true },
    endReason: { type: String, enum: [...END_REASONS, null], default: null },
    startedBy: { id: String, name: String },
    stoppedBy: { id: String, name: String },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },

    // Dialing state
    nextCallAt: { type: Date, default: null, index: true },
    lastCallAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    voicemailLeft: { type: Boolean, default: false },
    calls: { type: [callSchema], default: [] },

    // Sign-up follow-up loops this schedule paused when it took over, so they
    // can be stopped (pickup) or resumed (no pickup) when it ends.
    overtook: {
      type: [{ leadType: String, leadId: mongoose.Schema.Types.ObjectId, label: String, _id: false }],
      default: [],
    },
  },
  { timestamps: true }
);

// One active schedule per number.
matchCallCampaignSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_per_phone" }
);

matchCallCampaignSchema.statics.END_REASONS = END_REASONS;

module.exports = mongoose.model("MatchCallCampaign", matchCallCampaignSchema);
