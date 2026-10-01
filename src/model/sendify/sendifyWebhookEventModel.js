// model/sendify/sendifyWebhookEventModel.js
//
// Raw inbound webhook audit/replay log — lets a provider payload-shape bug
// get replayed without needing the provider to re-send. 30-day TTL since this
// is a debugging aid, not the source of truth (sendifyMessageModel is).
const mongoose = require("mongoose");

const sendifyWebhookEventSchema = new mongoose.Schema(
  {
    channelType: { type: String, required: true },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel" },
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

sendifyWebhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("sendifyWebhookEventModel", sendifyWebhookEventSchema);
