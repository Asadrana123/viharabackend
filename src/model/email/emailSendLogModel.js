// model/email/emailSendLogModel.js
//
// One row per property-sequence email (spec section 6, "Send log"). This is
// what enforces "never resend": a row is RESERVED (status "sending") before
// the Brevo call, and the unique dedupKey makes a second attempt for the same
// email lose the race instead of sending twice.
//
// dedupKey is "<recipient>|<propertyId>|<templateCode>" for buyer emails. PT1
// goes to the realtor once per buyer, so its key also carries the buyer's email.
//
// A "failed" row may be claimed again by a later attempt; a "sent" row never is.
const mongoose = require("mongoose");

const emailSendLogSchema = new mongoose.Schema(
  {
    dedupKey: { type: String, required: true, unique: true },

    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", required: true },
    templateCode: { type: String, required: true }, // E1, R1, R2, PT1, ...
    templateId: { type: Number, required: true },   // Brevo template ID

    status: { type: String, enum: ["sending", "sent", "failed"], default: "sending" },
    sentAt: { type: Date, default: null },
    brevoMessageId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

// "What has this person already received?" — the scheduler's main read.
emailSendLogSchema.index({ contactEmail: 1, sentAt: -1 });
emailSendLogSchema.index({ propertyId: 1, templateCode: 1 });

module.exports = mongoose.model("EmailSendLog", emailSendLogSchema);
