// model/enrichment/enrichmentCallRunModel.js
//
// One document per call dispatch from an Enrichment List. Calls go through
// our own runner (enrich.md §7.2, decision #3) rather than the existing
// calling campaign, so their tracking lives here — mirrors the shape of
// outboundCampaignModel so the progress UI can treat it the same way.

const mongoose = require("mongoose");

const callAttemptSchema = new mongoose.Schema(
  {
    phone: { type: String, default: "" },
    success: { type: Boolean, default: false },
    callId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const recipientSchema = new mongoose.Schema(
  {
    rowId: { type: mongoose.Schema.Types.ObjectId, ref: "enrichmentListRowModel" },
    name: { type: String, default: "" },
    phones: { type: [String], default: [] },
    // Additive beyond the plan's minimal table (§4.4) — buildContact's full
    // shape needs these for dispatchCall's prompt variables
    // (prospect_address/city/state). Snapshotted at prepare time so an edit
    // between prepare and run can't change what's actually said.
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    email: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "dispatched", "skipped", "failed"],
      default: "pending",
    },
    reason: { type: String, default: "" },
    // The exact prospect_research text actually sent for this recipient —
    // built once at prepare time from the stored/edited enrichment and the
    // property picked for this dispatch (enrich.md §7.2 decision #4).
    researchSummary: { type: String, default: "" },
    calls: { type: [callAttemptSchema], default: [] },
    processedAt: { type: Date, default: null },
  },
  { _id: false }
);

const enrichmentCallRunSchema = new mongoose.Schema(
  {
    listId: { type: mongoose.Schema.Types.ObjectId, ref: "enrichmentListModel", required: true },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "interrupted"],
      default: "queued",
    },
    // Snapshot of the property picked at send time, like Outbound.
    property: {
      id: { type: String, default: "" },
      name: { type: String, default: "" },
      slug: { type: String, default: null },
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
    recipients: { type: [recipientSchema], default: [] },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

enrichmentCallRunSchema.index({ listId: 1, createdAt: -1 });
enrichmentCallRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("enrichmentCallRunModel", enrichmentCallRunSchema);
