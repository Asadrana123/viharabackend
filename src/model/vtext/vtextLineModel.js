// model/vtext/vtextLineModel.js
//
// The sending-identity pool. A "line" is one channel-specific identity capable
// of sending/receiving messages — a Mac + dedicated Apple ID running
// BlueBubbles for iMessage (channelType "imessage-bluebubbles"), or (Phase 6)
// an Android phone + SIM running android-sms-gateway (channelType
// "android-sms") as the real-SMS fallback for contacts iMessage can't reach —
// see /Users/adi/projects/work/vihara/sendify-infra.md §3.1/§5 for the full design.
const mongoose = require("mongoose");

const CHANNEL_TYPES = ["imessage-bluebubbles", "android-sms", "mock"];
const LINE_STATUSES = ["provisioning", "warming", "active", "paused", "offline", "quarantined", "retired"];
const ROUTABLE_STATUSES = ["warming", "active"];

const vtextLineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Mac mini #1 – vtext1@icloud.com"
    channelType: { type: String, required: true, enum: CHANNEL_TYPES, index: true },
    address: { type: String, required: true, trim: true }, // Apple ID / iMessage handle; E.164 once SMS lines exist

    status: { type: String, enum: LINE_STATUSES, default: "provisioning", index: true },
    statusReason: { type: String, default: "" },
    statusChangedAt: { type: Date },
    statusChangedBy: {
      kind: { type: String, enum: ["system", "admin"] },
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String }, // name snapshot, same pattern as leadNote.advisorName
    },

    webhookKey: { type: String, required: true, unique: true }, // random hex, used in the inbound webhook URL path
    config: { type: mongoose.Schema.Types.Mixed, default: {} }, // channel-specific, validated by adapter.validateConfig()
    credentials: {
      iv: { type: String, select: false },
      tag: { type: String, select: false },
      ciphertext: { type: String, select: false },
    },

    limits: {
      perMinute: { type: Number },
      perDay: { type: Number },
      newRecipientsPerHour: { type: Number },
      replyReservePct: { type: Number },
      jitterMs: {
        min: { type: Number },
        max: { type: Number },
      },
    },
    warmup: {
      enabled: { type: Boolean, default: true },
      startedAt: { type: Date },
      schedule: [{ fromDay: Number, perDay: Number }],
    },
    routing: {
      acceptsNewContacts: { type: Boolean, default: true },
      weight: { type: Number, default: 1 },
    },
    health: {
      lastHeartbeatAt: { type: Date },
      lastSuccessAt: { type: Date },
      lastFailureAt: { type: Date },
      consecutiveFailures: { type: Number, default: 0 },
      failureRateRecent: { type: Number },
      replyRatio7d: { type: Number },
      sentLast7d: { type: Number }, // rollup paired with replyRatio7d (daily-rollover job) — the volume guard for the §7.4 soft throttle
      device: {
        batteryPct: { type: Number },
        signal: { type: Number },
        appVersion: { type: String },
      },
    },
    hardware: {
      deviceLabel: { type: String },
      macSerialLast4: { type: String },
      appleIdRecoveryEmail: { type: String },
      location: { type: String },
      purchasedAt: { type: Date },
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

vtextLineSchema.index({ channelType: 1, status: 1 });
vtextLineSchema.index({ channelType: 1, address: 1 }, { unique: true });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextLineModel", vtextLineSchema, "sendifylinemodels");
module.exports.CHANNEL_TYPES = CHANNEL_TYPES;
module.exports.LINE_STATUSES = LINE_STATUSES;
module.exports.ROUTABLE_STATUSES = ROUTABLE_STATUSES;
