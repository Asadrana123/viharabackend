// model/email/propertyEmailLeadModel.js
//
// The "lead record" from the property email spec (section 6): ONE record per
// person per property. A person interested in three properties has three
// records, each moving through the email sequence on its own.
//
// This is separate from propertyLeadModel (the landing-page form submission,
// which also drives calls) and AuctionRegistration (the bid sign-up). Both of
// those feed into this record; this record is what the email sequence reads.
//
// Dedup gate: unique { contactEmail, propertyId }. Signing up twice for one
// property merges into the same record and keeps the earliest source.
const mongoose = require("mongoose");

const propertyEmailLeadSchema = new mongoose.Schema(
  {
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", required: true },

    // For the email's FIRSTNAME and the "to" name. Updated on every signup.
    fullName: { type: String, default: "", trim: true },

    // How they first arrived. Decides the track; never overwritten by a later signup.
    source: {
      type: String,
      enum: ["early_access", "property_lead", "match", "partner_referral"],
      required: true,
    },
    // The referring realtor, for partner_referral leads (PT1 goes to them).
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "realtorModel", default: null },

    quoteAmount: { type: Number, default: null },

    // Free bid sign-up for this auction (AuctionRegistration exists).
    registered: { type: Boolean, default: false },
    // Set by the team after checking ID and proof of funds. null = not registered.
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", null],
      default: null,
    },
    callBooked: { type: Boolean, default: false },
    bidPlaced: { type: Boolean, default: false },
    outcome: { type: String, enum: ["won", "lost", null], default: null },

    // The old auction date to show in the next email's "New auction date"
    // banner. Cleared after that email sends (phase 2).
    oldDatePending: { type: String, default: null },

    // Last email of the sequence sent to this person for this property.
    lastEmailAt: { type: Date, default: null },

    status: { type: String, enum: ["open", "closed"], default: "open" },
    closedAt: { type: Date, default: null },
    // Why the record closed: "rejected" | "hard_bounce" | "spam" | "unsubscribed" | "blocklisted" | ...
    closedReason: { type: String, default: "" },
  },
  { timestamps: true }
);

propertyEmailLeadSchema.index({ contactEmail: 1, propertyId: 1 }, { unique: true });
// The scheduler's sweep: every open record for a property.
propertyEmailLeadSchema.index({ propertyId: 1, status: 1 });

module.exports = mongoose.model("PropertyEmailLead", propertyEmailLeadSchema);
