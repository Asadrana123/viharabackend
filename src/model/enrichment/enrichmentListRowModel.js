// model/enrichment/enrichmentListRowModel.js
//
// One document per contact in an uploaded Enrichment List. Holds the raw CSV
// row, what the parser pulled out of it, the shared enrichment result this
// row resolved to (if any), and the admin's edits — kept separate from both
// the CSV and FullEnrich values so nothing is silently overwritten. See
// enrich.md §4.3.

const mongoose = require("mongoose");

const enrichmentListRowSchema = new mongoose.Schema(
  {
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "enrichmentListModel",
      required: true,
    },

    // 1-based data row from the CSV, for the admin to find it in their file.
    rowNumber: { type: Number, required: true },

    // The original CSV row, every column, exactly as uploaded. Nothing from
    // the source is lost even if a column isn't mapped.
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },

    csv: {
      fullName: { type: String, default: "" },
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      company: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
      activeMarket: { type: String, default: "" },
      contactType: {
        type: String,
        enum: ["buyer", "seller", "llc_owner", "unknown"],
        default: "unknown",
      },
      phones: { type: [String], default: [] },
      emails: { type: [String], default: [] },
    },

    keys: {
      // "<normalized full name>|<normalized company>", or "" if the row
      // doesn't have both a first+last name and a company.
      nameCompany: { type: String, default: "" },
      // First valid email, normalized, or "".
      email: { type: String, default: "" },
    },

    enrichment: {
      status: {
        type: String,
        enum: ["pending", "enriched", "reused", "not_found", "no_lookup_key", "failed"],
        default: "pending",
      },
      method: { type: String, enum: ["name_company", "email", null], default: null },
      personId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "enrichedPersonModel",
        default: null,
      },
      // The FullEnrich batch this row was submitted in, while in flight —
      // lets resume re-poll instead of resubmitting (Phase 2).
      providerRequestId: { type: String, default: "" },
      // Set when the admin edits name/first/last/company/email (§7.4). The
      // old result stays visible with a "may be stale" marker until the
      // admin clicks Re-enrich.
      stale: { type: Boolean, default: false },
      error: { type: String, default: "" },
      processedAt: { type: Date, default: null },
    },

    // The admin's edits, keyed by editable field name (see
    // enrichmentContactsService.EDITABLE_FIELDS). A key that's absent means
    // "not edited". Never written back to enrichedPersonModel (decision #13).
    overrides: { type: mongoose.Schema.Types.Mixed, default: {} },

    editedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
      email: { type: String, default: "" },
    },
    editedAt: { type: Date, default: null },

    // Drops the row from every future send without deleting it. There's no
    // separate approve step — a row that isn't excluded is sendable
    // (decision #14).
    excluded: { type: Boolean, default: false },

    lastSent: {
      call: {
        at: { type: Date, default: null },
        refId: { type: mongoose.Schema.Types.ObjectId, default: null },
        status: { type: String, default: "" },
      },
      sms: {
        at: { type: Date, default: null },
        refId: { type: mongoose.Schema.Types.ObjectId, default: null },
        status: { type: String, default: "" },
      },
      email: {
        at: { type: Date, default: null },
        refId: { type: mongoose.Schema.Types.ObjectId, default: null },
        status: { type: String, default: "" },
      },
    },
  },
  { timestamps: true }
);

enrichmentListRowSchema.index({ listId: 1, rowNumber: 1 }, { unique: true });
enrichmentListRowSchema.index({ listId: 1, "enrichment.status": 1 });
enrichmentListRowSchema.index({ listId: 1, excluded: 1 });
enrichmentListRowSchema.index({ "keys.nameCompany": 1 });
enrichmentListRowSchema.index({ "keys.email": 1 });

module.exports = mongoose.model("enrichmentListRowModel", enrichmentListRowSchema);
