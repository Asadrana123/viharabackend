// model/outbound/outboundCallRunModel.js
//
// One document per admin-triggered Outbound call dispatch (single contact or
// CSV). Shaped like enrichmentCallRunModel.js (persisted, pollable, survives
// a restart) but simpler — not tied to a stored list, a one-shot dispatch
// like outboundCampaignModel's sms/email campaigns. Kept as its own
// collection rather than extending outboundCampaignModel, mirroring how
// Enrichment's call runs are their own collection too.

const mongoose = require("mongoose");

const callAttemptSchema = new mongoose.Schema(
  {
    success: { type: Boolean, default: false },
    callId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const recipientSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "dispatched", "skipped", "failed"],
      default: "pending",
    },
    reason: { type: String, default: "" },
    call: { type: callAttemptSchema, default: () => ({}) },
    processedAt: { type: Date, default: null },
  },
  { _id: false }
);

const outboundCallRunSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "interrupted"],
      default: "queued",
    },
    // Which UI mode created it — a single manually-entered contact or a CSV.
    source: { type: String, enum: ["single", "csv"], required: true },
    csvFileName: { type: String, default: "" },

    maxContacts: { type: Number, required: true },

    property: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", required: true },
      name: { type: String, default: "" },
      slug: { type: String, default: "" },
      address: { type: String, default: "" },
    },

    createdBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
      email: { type: String, default: "" },
      name: { type: String, default: "" },
    },

    counts: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      dispatched: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },

    // Rows dropped at parse time (invalid/missing phone, or a duplicate
    // within the batch) — never became a recipient subdoc.
    parseSkipped: [
      {
        row: { type: Number },
        name: { type: String, default: "" },
        reason: { type: String, default: "" },
      },
    ],

    recipients: { type: [recipientSchema], default: [] },

    error: { type: String, default: "" },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

outboundCallRunSchema.index({ createdAt: -1 });
outboundCallRunSchema.index({ "property.id": 1, createdAt: -1 });

module.exports = mongoose.model("outboundCallRunModel", outboundCallRunSchema);
