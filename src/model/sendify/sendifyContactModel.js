// model/sendify/sendifyContactModel.js
//
// One per phone number — the consent/opt-out system of record for Sendify,
// deliberately separate from the fragmented existing precedents
// (unsubscribeModel is email-only; smsConsent/smsConsentText/smsConsentAt
// live scattered across propertyLead/partnerLead/norCalLead; callingStopped
// lives in stopCallingController's own per-lead-type flags). leadRefs links
// back to whichever of those collections a number matches, so Sendify can
// inherit consent evidence without duplicating the leads' own data.
const mongoose = require("mongoose");
const { LEAD_TYPES } = require("../leads/leadNoteModel");

const sendifyContactSchema = new mongoose.Schema(
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
      viaLineId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel" },
      viaMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyMessageModel" },
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
    lastInboundAt: { type: Date },
    lastOutboundAt: { type: Date },
    source: { type: String, enum: ["lead", "inbound-unknown", "admin", "import"], default: "admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("sendifyContactModel", sendifyContactSchema);
