// model/vtext/vtextContactModel.js
//
// One per phone number — the consent/opt-out system of record for Vtext,
// deliberately separate from the fragmented existing precedents
// (unsubscribeModel is email-only; smsConsent/smsConsentText/smsConsentAt
// live scattered across propertyLead/partnerLead/norCalLead; callingStopped
// lives in stopCallingController's own per-lead-type flags). leadRefs links
// back to whichever of those collections a number matches, so Vtext can
// inherit consent evidence without duplicating the leads' own data.
const mongoose = require("mongoose");
const { LEAD_TYPES } = require("../leads/leadNoteModel");

const vtextContactSchema = new mongoose.Schema(
  {
    phoneE164: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    timezone: { type: String }, // resolvePropertyTimezone(state,zip) if lead-linked, else areaCodeTimezone (Phase 2+)
    phoneStatus: { type: String, enum: ["unknown", "valid", "invalid", "landline"], default: "unknown" },

    consent: {
      status: { type: String, enum: ["unknown", "opted-in", "opted-out"], default: "unknown", index: true },
      source: { type: String }, // "lead-form" | "inbound-initiated" | "admin" | "import"
      capturedAt: { type: Date },
      consentText: { type: String }, // snapshot, cf. lead.smsConsentText
      evidence: {
        leadType: { type: String, enum: LEAD_TYPES },
        leadId: { type: mongoose.Schema.Types.ObjectId },
      },
    },
    optOut: {
      isOptedOut: { type: Boolean, default: false, index: true },
      at: { type: Date },
      keyword: { type: String },
      method: { type: String, enum: ["keyword", "phrase", "admin", "import"] },
      viaLineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel" },
      viaMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextMessageModel" },
    },
    consentEvents: [
      {
        type: { type: String, enum: ["opt-in", "opt-out", "help", "resubscribe"], required: true },
        at: { type: Date, default: Date.now },
        method: { type: String },
        keyword: { type: String },
        messageId: { type: mongoose.Schema.Types.ObjectId },
        lineId: { type: mongoose.Schema.Types.ObjectId },
        adminId: { type: mongoose.Schema.Types.ObjectId },
        adminName: { type: String },
      },
    ],

    stickyLines: { type: Map, of: mongoose.Schema.Types.ObjectId, default: {} }, // channelType -> lineId
    channelReachability: [
      {
        channelType: { type: String },
        reachable: { type: Boolean, default: null },
        checkedAt: { type: Date },
      },
    ],

    leadRefs: [
      {
        leadType: { type: String, enum: LEAD_TYPES },
        leadId: { type: mongoose.Schema.Types.ObjectId },
      },
    ],
    tags: [{ type: String }],

    // Follow-up texts after a property signup (vtextFollowUpService.js).
    // "no-response" means all follow-ups went out and the contact never replied.
    followUp: {
      status: { type: String, enum: ["active", "replied", "opted-out", "no-response", "cancelled"] },
      leadId: { type: mongoose.Schema.Types.ObjectId },
      propertyId: { type: mongoose.Schema.Types.ObjectId },
      timezone: { type: String },
      sequenceVersion: { type: Number }, // 2 = the 4-step, auction-dated sequence; unset = the old 7-step one, which is ended on sight
      step: { type: Number }, // follow-ups sent so far (set to 0 at enrollment)
      doneSteps: [{ type: Number }], // step numbers (1-4) already sent or skipped
      startedAt: { type: Date },
      nextAt: { type: Date }, // null while no send is scheduled
      lastSentAt: { type: Date },
      lastMessageId: { type: mongoose.Schema.Types.ObjectId },
      finalCheckAt: { type: Date }, // after the last follow-up: when to give up waiting for a reply
      endedAt: { type: Date },
      endedReason: { type: String },
    },
    lastInboundAt: { type: Date },
    lastOutboundAt: { type: Date },
    source: { type: String, enum: ["lead", "inbound-unknown", "admin", "import"], default: "admin" },
  },
  { timestamps: true }
);

// The follow-up sweep looks up active sequences that are due.
vtextContactSchema.index({ "followUp.status": 1, "followUp.nextAt": 1 });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextContactModel", vtextContactSchema, "sendifycontactmodels");
