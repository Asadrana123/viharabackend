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

// Compound index to ensure each user has only one auto-bid setting per auction
autoBiddingSchema.index({ userId: 1, auctionId: 1 }, { unique: true });

module.exports = mongoose.model("AutoBidding", autoBiddingSchema);