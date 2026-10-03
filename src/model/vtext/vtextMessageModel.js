// model/vtext/vtextMessageModel.js
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
  // An AI-drafted reply (Phase 7c), sitting un-enqueued until an admin
  // approves it (or vtextSettingsModel's aiAutoReplyEnabled auto-approves
  // it). Deliberately excluded from routeWorker.js's STATUSES_ROUTABLE.
  "pending-approval",
];
const INBOUND_STATUSES = ["received"];
const ALL_STATUSES = [...OUTBOUND_STATUSES, ...INBOUND_STATUSES];

const vtextMessageSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ["in", "out"], required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextContactModel", required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextConversationModel", index: true }, // null until routed
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel", index: true }, // null until routed
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
    excludeLineIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel" }],

    origin: {
      kind: { type: String, enum: ["manual", "bulk", "automation", "system", "api"], default: "manual" },
      // Which system-generated reply this is — "stop-confirm" | "help" |
      // "resubscribe-confirm" (inboundWorker.js). vtextComplianceService's
      // canSend() checks this to let a kind:"system" reply through even to an
      // opted-out contact. Mongoose silently drops unrecognized subdocument
      // fields on save (strict mode default) — this was missing from the
      // schema entirely until found directly: every system reply was saving
      // successfully but losing templateKey in the process, which made the
      // compliance bypass check fail and the reply itself come back blocked
      // (by the very opt-out it existed to confirm), with no error anywhere
      // to point at the cause.
      templateKey: { type: String },
      batchId: { type: String },
      campaignId: { type: mongoose.Schema.Types.ObjectId },
      replyToMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextMessageModel" },
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

    // Set only on an AI-drafted reply (Phase 7c, vtextAiReplyService.js /
    // draftReplyWorker.js). "pending" until an admin (or auto-approve) acts
    // on it; "edited" means the body was changed before approval.
    aiDraft: {
      approvalStatus: { type: String, enum: ["pending", "approved", "edited", "rejected"] },
      model: { type: String },
      generatedAt: { type: Date },
      approvedBy: {
        adminId: { type: mongoose.Schema.Types.ObjectId },
        adminName: { type: String },
      },
      approvedAt: { type: Date },
    },
  },
  { timestamps: true }
);

vtextMessageSchema.index({ conversationId: 1, createdAt: 1 });
vtextMessageSchema.index({ contactId: 1, createdAt: -1 });
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
vtextMessageSchema.index(
  { channelType: 1, "provider.messageId": 1 },
  { unique: true, partialFilterExpression: { "provider.messageId": { $type: "string" } } }
);
vtextMessageSchema.index({ status: 1, updatedAt: 1 });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextMessageModel", vtextMessageSchema, "sendifymessagemodels");
module.exports.OUTBOUND_STATUSES = OUTBOUND_STATUSES;
module.exports.INBOUND_STATUSES = INBOUND_STATUSES;
