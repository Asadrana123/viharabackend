const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true
  },
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "productModel",
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  mobilePhone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: null
  },
  buyerType: {
    type: String,
    enum: ["Cash investor", "Owner-occupant", "Fix and flip", "Buy and hold"],
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  // ============================================
  // REALTOR AFFILIATE ATTRIBUTION  (Req 4, Req 5)
  // Stamped when a buyer registers via a realtor showcase journey
  // (/:slug -> property -> Register for Auction). Defaults keep every
  // existing and direct (non-referred) registration unaffected.
  // realtorId is the authoritative per-registration attribution that the
  // realtor dashboard reads.
  // ============================================
  realtorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "realtorModel",
    default: null
  },
  showcaseSlug: {
    type: String,
    default: null
  },
  attributionSource: {
    type: String,
    enum: ["realtor_showcase", "direct"],
    default: "direct"
  },
  attributedAt: {
    type: Date,
    default: null
  },

  submittedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("AuctionRegistration", registrationSchema);
