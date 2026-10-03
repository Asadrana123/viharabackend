// model/vtext/vtextWebhookEventModel.js
//
// Raw inbound webhook audit/replay log — lets a provider payload-shape bug
// get replayed without needing the provider to re-send. 30-day TTL since this
// is a debugging aid, not the source of truth (vtextMessageModel is).
const mongoose = require("mongoose");

const vtextWebhookEventSchema = new mongoose.Schema(
  {
    channelType: { type: String, required: true },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel" },
    lineKey: { type: String },
    headers: { type: mongoose.Schema.Types.Mixed }, // whitelisted subset only — never store raw auth headers
    body: { type: mongoose.Schema.Types.Mixed },
    signatureValid: { type: Boolean },
    receivedAt: { type: Date, default: Date.now },
    processed: { type: Boolean, default: false },
    jobId: { type: String },
    error: { type: String },
  },
  { timestamps: true }
);

vtextWebhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextWebhookEventModel", vtextWebhookEventSchema, "sendifywebhookeventmodels");
