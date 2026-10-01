// model/sendify/sendifyMessageModel.js
//
// Every inbound and outbound message — the two-way history the whole project
// exists to keep. `status` tracks an outbound message through the queue
// (Phase 2+); inbound messages are written straight to "received". Status
// transitions are monotonic once a message is sent (a "delivered" webhook
// arriving after "sent" never regresses) — enforced in the service layer,
// not the schema.
const mongoose = require("mongoose");

const OUTBOUND_STATUSES = [
  "queued", "waiting-window", "waiting-capacity", "assigned", "sending",
  "accepted", "sent", "delivered", "failed", "cancelled", "blocked", "unknown",
];
const INBOUND_STATUSES = ["received"];
const ALL_STATUSES = [...OUTBOUND_STATUSES, ...INBOUND_STATUSES];

const sendifyMessageSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ["in", "out"], required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyContactModel", required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyConversationModel", index: true }, // null until routed
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel", index: true }, // null until routed
    channelType: { type: String },

    body: { type: String, required: true },
    segments: { type: Number }, // iMessage has no carrier-style segment billing; logged for cost/debugging anyway
    encoding: { type: String }, // reserved for the SMS fallback channel (Phase 6)

    status: { type: String, enum: ALL_STATUSES, required: true, index: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, detail: String }],

    channelPolicy: {
      mode: { type: String, enum: ["any", "only", "prefer"], default: "any" },
      channels: [{ type: String }],
    },
    excludeLineIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel" }],

    origin: {
      kind: { type: String, enum: ["manual", "bulk", "automation", "system", "api"], default: "manual" },
      batchId: { type: String },
      campaignId: { type: mongoose.Schema.Types.ObjectId },
      replyToMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyMessageModel" },
      sentBy: {
        adminId: { type: mongoose.Schema.Types.ObjectId },
        adminName: { type: String },
      },
    },
    isReplyToInbound: { type: Boolean, default: false },
    idempotencyKey: { type: String, unique: true, sparse: true },

    provider: {
      messageId: { type: String },
      raw: { type: mongoose.Schema.Types.Mixed },
    },
    error: {
      kind: { type: String, enum: ["recipient", "line", "transient", "compliance", "config"] },
      code: { type: String },
      message: { type: String },
    },
    attempts: { type: Number, default: 0 },

    scheduledFor: { type: Date },
    queuedAt: { type: Date },
    assignedAt: { type: Date },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    receivedAt: { type: Date },

    keyword: {
      type: { type: String, enum: ["stop", "help", "start", null], default: null },
      matched: { type: String },
      method: { type: String, enum: ["exact", "phrase"] },
    },
    readAt: { type: Date },
  },
  { timestamps: true }
);

sendifyMessageSchema.index({ conversationId: 1, createdAt: 1 });
sendifyMessageSchema.index({ contactId: 1, createdAt: -1 });
// A plain `sparse: true` unique index turned out NOT to exclude documents
// where provider.messageId is merely null (as opposed to the whole `provider`
// object being absent) — found this directly, by hitting a real duplicate-key
// error across two blocked messages that never got a provider id. A partial
// index with an explicit $exists/$ne condition is unambiguous: only messages
// that actually HAVE a provider message id participate in the uniqueness
// constraint at all.
// $ne isn't allowed in a partialFilterExpression (Mongo rejects it as an
// unsupported $not internally) — $type excludes both "missing" and
// "explicitly null" in one supported operator, which is what we actually want.
sendifyMessageSchema.index(
  { channelType: 1, "provider.messageId": 1 },
  { unique: true, partialFilterExpression: { "provider.messageId": { $type: "string" } } }
);
sendifyMessageSchema.index({ status: 1, updatedAt: 1 });

module.exports = mongoose.model("sendifyMessageModel", sendifyMessageSchema);
module.exports.OUTBOUND_STATUSES = OUTBOUND_STATUSES;
module.exports.INBOUND_STATUSES = INBOUND_STATUSES;
