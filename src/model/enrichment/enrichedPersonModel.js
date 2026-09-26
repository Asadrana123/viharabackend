// model/enrichment/enrichedPersonModel.js
//
// The shared FullEnrich result store for the Enrichment Lists feature — one
// document per person we've looked up, regardless of which upload first
// caused it. This is what stops a second CSV upload from paying FullEnrich
// again for someone already found. See enrich.md §4.1 for the full
// rationale.
//
// Primary lookup key is normalized "full name|company" (most SFR-style rows
// have no email at all — see enrich.md §2.7). Email is a secondary key, used
// only for the rare row that has one and for the reverse-email fallback.

const mongoose = require("mongoose");

const enrichedPersonSchema = new mongoose.Schema(
  {
    // "<normalized full name>|<normalized company>". Unique + sparse: only
    // set on records looked up by name + company (§4.1).
    dedupeKey: { type: String, default: undefined },

    // Normalized email. Unique + sparse: only set on records looked up
    // through the reverse-email fallback path.
    lookupEmail: { type: String, default: undefined, lowercase: true, trim: true },

    // Every email tied to this person — lookupEmail (if set) plus whatever
    // FullEnrich found. Secondary-key matches search this array too.
    knownEmails: { type: [String], default: [] },

    lookupMethod: { type: String, enum: ["name_company", "email"], required: true },

    // Exactly what we sent FullEnrich, for when a result looks wrong.
    lookupInput: { type: mongoose.Schema.Types.Mixed, default: {} },

    provider: { type: String, default: "fullenrich" },

    // pending doubles as an in-flight lock (enrichmentJobService, Phase 2).
    // failed = we don't know (API error, rejected contact, poll timeout) —
    // retryable. not_found = FullEnrich finished and found no email.
    status: {
      type: String,
      enum: ["pending", "found", "not_found", "failed"],
      default: "pending",
    },

    // FullEnrich's raw per-contact result, stored exactly as returned.
    result: { type: mongoose.Schema.Types.Mixed, default: null },

    // Flattened copy of the fields the UI and hand-off actually use, pulled
    // out of `result` when it's saved. Nothing downstream digs into `result`
    // directly. jobTitle/companyName/industry/linkedinUrl are only ever
    // populated if Phase 0 confirms the name+company endpoint returns them
    // when only email is requested (enrich.md §2.8).
    summary: {
      workEmail: { type: String, default: "" },
      emails: { type: [String], default: [] },
      jobTitle: { type: String, default: "" },
      companyName: { type: String, default: "" },
      industry: { type: String, default: "" },
      linkedinUrl: { type: String, default: "" },
    },

    error: { type: String, default: "" },
    attempts: { type: Number, default: 0 },

    // FullEnrich's enrichment_id for the batch this person was submitted in.
    // Lets resume/retry re-poll a batch instead of paying to resubmit it.
    providerRequestId: { type: String, default: "" },

    enrichedAt: { type: Date, default: null },

    // Which upload first caused the lookup. Audit only — that list may be
    // deleted later without touching this record (decision #21).
    firstSeenListId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "enrichmentListModel",
      default: null,
    },
  },
  { timestamps: true }
);

enrichedPersonSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
enrichedPersonSchema.index({ lookupEmail: 1 }, { unique: true, sparse: true });
enrichedPersonSchema.index({ knownEmails: 1 });
enrichedPersonSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("enrichedPersonModel", enrichedPersonSchema);
