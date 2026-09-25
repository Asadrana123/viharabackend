// model/outbound/outboundCampaignModel.js
//
// One document per admin-triggered outbound SMS or Email campaign. This is
// the only audit trail for outbound SMS — our backend never sends a text
// itself (Brevo's automation does), so this collection is the sole record of
// what an admin sent, to whom, for which property, and when.
//
// See outboundplan.md §6 for the full field-by-field rationale. Kept as a
// real Mongoose collection (not the in-memory Map the calling campaigns use)
// specifically so history survives a Render restart/redeploy.

const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    email: { type: String, default: "", lowercase: true, trim: true },
    // Normalized +1XXXXXXXXXX. SMS only.
    phone: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "succeeded", "skipped", "failed"],
      default: "pending",
    },
    // Fail reason (Brevo or SMTP message). "skipped" is unused in v1 — rows
    // that would be skipped (invalid/duplicate) are dropped at parse time
    // into `parseSkipped` instead, before a recipient subdoc is even created.
    reason: { type: String, default: "" },
    // SMS only — true when Brevo reported the number already belongs to
    // another contact (the fallback save succeeded without the SMS field,
    // so the automation can't text them; recorded as `failed`, see §5.1).
    smsConflict: { type: Boolean, default: false },
    // Email only — the nodemailer messageId from sendEmailAsync.
    messageId: { type: String, default: "" },
    processedAt: { type: Date, default: null },
  },
  { _id: false }
);

const outboundCampaignSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ["sms", "email"], required: true },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "interrupted"],
      default: "queued",
    },
    // Which UI mode created it — a single manually-entered contact, or a CSV.
    source: { type: String, enum: ["single", "csv"], required: true },
    csvFileName: { type: String, default: "" },

    // The limit the admin set at launch, always <= MAX_CONTACTS_CEILING (500,
    // shared by both channels — see outboundContactsService.js). Kept on the
    // document for the audit trail even though it's enforced before creation.
    maxContacts: { type: Number, required: true },

    property: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", required: true },
      // Snapshots, so history still reads correctly if the listing changes later.
      name: { type: String, default: "" },
      slug: { type: String, default: "" },
      address: { type: String, default: "" },
    },

    createdBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
      email: { type: String, default: "" },
      name: { type: String, default: "" },
    },

    // SMS-only fields (required only when channel === "sms").
    sms: {
      // Snapshot of property.brevoOutboundSmsListId at launch time, so
      // editing the property's list mid-run can't split a campaign across
      // two Brevo lists. There's no list-source enum — per-property is the
      // only v1 mechanism and there's no shared fallback.
      listId: {
        type: Number,
        required: function () {
          return this.channel === "sms";
        },
      },
      // The admin's "these contacts have given consent" attestation. A
      // campaign can't be created without this being true when channel is sms.
      consentAttested: {
        type: Boolean,
        required: function () {
          return this.channel === "sms";
        },
      },
    },

    // Email-only fields.
    email: {
      subject: { type: String, default: "" }, // template, before {{var}} substitution
      body: { type: String, default: "" }, // template, before {{var}} substitution
      bodyFormat: { type: String, enum: ["text", "html"], default: "text" },
    },

    counts: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 }, // sms: "added to Brevo list"; email: "accepted by mail server"
      skipped: { type: Number, default: 0 }, // unused by v1 runners; reserved for the future unsubscribe check
      failed: { type: Number, default: 0 },
    },

    // Rows dropped at parse time (invalid/missing phone or email, or a
    // duplicate within the batch) — never became a recipient subdoc.
    parseSkipped: [
      {
        row: { type: Number },
        name: { type: String, default: "" },
        reason: { type: String, default: "" },
      },
    ],

    recipients: { type: [recipientSchema], default: [] },

    // Set if the whole campaign run threw/aborted (as opposed to individual
    // recipient failures, which live on each recipient instead).
    error: { type: String, default: "" },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

outboundCampaignSchema.index({ createdAt: -1 });
outboundCampaignSchema.index({ channel: 1, createdAt: -1 });
outboundCampaignSchema.index({ "property.id": 1, createdAt: -1 });

module.exports = mongoose.model("outboundCampaignModel", outboundCampaignSchema);
