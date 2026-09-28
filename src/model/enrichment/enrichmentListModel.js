// model/enrichment/enrichmentListModel.js
//
// One document per uploaded contact CSV ("Enrichment List" in the admin UI).
// Tracks the enrichment job's progress and the list's send history
// (`dispatches`). Rows themselves live in enrichmentListRowModel — see
// enrich.md §4 for why this is three collections instead of one.
//
// Job state lives here in Mongo (not an in-memory Map), following
// outboundCampaignModel's pattern, because a redeploy shouldn't lose an
// enrichment run that can take a while — see enrich.md §5.5.

const mongoose = require("mongoose");

const dispatchSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ["call", "sms", "email"], required: true },
    // Points at the outboundCampaign (sms/email) or enrichmentCallRun (call)
    // this send created.
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "productModel" },
    propertyName: { type: String, default: "" },
    rowCount: { type: Number, default: 0 },
    createdBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
      email: { type: String, default: "" },
      name: { type: String, default: "" },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const enrichmentListSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    csvFileName: { type: String, default: "" },
    source: { type: String, enum: ["csv"], default: "csv" },

    // ready = enrichment is done and the list can be reviewed and sent.
    // interrupted is set lazily on read, same 10-minute stale rule as
    // Outbound (enrich.md §5.5).
    status: {
      type: String,
      enum: ["queued", "enriching", "ready", "failed", "interrupted"],
      default: "queued",
    },

    counts: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      enriched: { type: Number, default: 0 },
      reused: { type: Number, default: 0 },
      notFound: { type: Number, default: 0 },
      noLookupKey: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },

    // Rows dropped at upload time (empty rows, no usable contact info,
    // in-file duplicates) — never became a row document.
    parseSkipped: [
      {
        row: { type: Number },
        name: { type: String, default: "" },
        reason: { type: String, default: "" },
      },
    ],

    createdBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
      email: { type: String, default: "" },
      name: { type: String, default: "" },
    },

    enrichStartedAt: { type: Date, default: null },
    enrichFinishedAt: { type: Date, default: null },
    // Heartbeat, set on every poll round in the Phase 2 job, so a healthy
    // job waiting on a slow batch isn't flagged stale.
    lastPolledAt: { type: Date, default: null },

    error: { type: String, default: "" },

    dispatches: { type: [dispatchSchema], default: [] },
  },
  { timestamps: true }
);

enrichmentListSchema.index({ createdAt: -1 });
enrichmentListSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("enrichmentListModel", enrichmentListSchema);
