// model/manualBidModel.js
const mongoose = require("mongoose");

const manualBidSchema = new mongoose.Schema({
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "productModel",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true
  },
  // The auction round this bid was placed in. Unset only on bids placed before
  // rounds existed and not yet migrated.
  roundId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AuctionRound",
    default: null
  },
  amount: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
},{ timestamps: true });

// Create indexes for better query performance
manualBidSchema.index({ auctionId: 1, createdAt: -1 });
manualBidSchema.index({ userId: 1, auctionId: 1 });
manualBidSchema.index({ auctionId: 1, amount: -1 });
manualBidSchema.index({ roundId: 1, createdAt: -1 });
manualBidSchema.index({ roundId: 1, amount: -1 });

module.exports = mongoose.model("ManualBid", manualBidSchema);