// model/bidding/auctionRoundModel.js
//
// One document per auction held for a property. A property can be auctioned
// many times; each time is a new round, and old rounds are never overwritten.
//
// While a round is open, the property (productModel) holds its live values —
// dates, prices, current bid — so the bidding flow keeps reading the property.
// When the round closes, those values are copied here together with the result
// and a snapshot of the registration list, so the round's history stays fixed
// even if the property or a registration changes later.
const mongoose = require("mongoose");

const registrationSnapshotSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: "AuctionRegistration" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "userModel" },
    name: { type: String, default: "" },
    buyerType: { type: String, default: "" },
    status: { type: String, default: "pending" },
    submittedAt: { type: Date, default: null }
  },
  { _id: false }
);

const auctionRoundSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "productModel",
      required: true
    },
    roundNumber: { type: Number, required: true },

    // Terms. Set when the round opens and refreshed from the property when it closes.
    auctionStartDate: { type: Date, default: null },
    auctionEndDate: { type: Date, default: null },
    startBid: { type: Number, default: null },
    reservePrice: { type: Number, default: null },
    minIncrement: { type: Number, default: null },

    // Result, filled when the round closes.
    closedAt: { type: Date, default: null },
    highestBid: { type: Number, default: null },
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", default: null },
    winnerName: { type: String, default: null },
    totalBids: { type: Number, default: 0 },

    // Registration list as it was when the round closed (rejected excluded).
    registrations: { type: [registrationSnapshotSchema], default: [] },

    sellerEmailSentAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { timestamps: true }
);

auctionRoundSchema.index({ productId: 1, roundNumber: -1 }, { unique: true });

module.exports = mongoose.model("AuctionRound", auctionRoundSchema);
