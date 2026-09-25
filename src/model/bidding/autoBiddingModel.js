// model/autoBidding.js
const mongoose = require("mongoose");

const autoBiddingSchema = new mongoose.Schema({
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
  // The auction round this setting applies to. Settings don't carry into the
  // next round — bidders set them again.
  roundId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AuctionRound",
    default: null
  },
  enabled: {
    type: Boolean,
    default: false
  },
  maxAmount: {
    type: Number,
    required: true
  },
  increment: {
    type: Number,
    default: 1000
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Each user has only one auto-bid setting per auction round. (Replaces the old
// one-per-property index; the auction-rounds migration drops that one.)
autoBiddingSchema.index({ userId: 1, auctionId: 1, roundId: 1 }, { unique: true });

module.exports = mongoose.model("AutoBidding", autoBiddingSchema);