// model/propertyFunnel/pfSyncRunModel.js
//
// Property Funnel: how each source's last sync went, for the Data health tab. One row per source.
// Mirrors `sync_runs`.
const mongoose = require("mongoose");

const SOURCES = ["Zernio ads", "Zernio posts", "GA4", "Clarity", "Sanity", "VText", "Dialer", "Brevo"];

const pfSyncRunSchema = new mongoose.Schema(
  {
    source: { type: String, enum: SOURCES, required: true, unique: true },
    ok: { type: Boolean, required: true },
    lastSuccess: { type: Date, default: null },
    lastRun: { type: Date, default: Date.now },
    detail: { type: String, default: "", maxlength: 500 },
  },
  { collection: "pf_sync_runs" }
);

/** Record how a sync went. Call at the end of every job (in a finally block). */
pfSyncRunSchema.statics.record = function record(source, ok, detail) {
  const now = new Date();
  return this.updateOne(
    { source },
    { $set: { ok, lastRun: now, detail: String(detail || "").slice(0, 500), ...(ok ? { lastSuccess: now } : {}) } },
    { upsert: true }
  );
};

module.exports = mongoose.model("PfSyncRun", pfSyncRunSchema);
module.exports.SOURCES = SOURCES;
