// utils/bidsManager.js
const ManualBid = require('../model/manualBiddingModel');
const AutoBidding = require('../model/autoBiddingModel');
const Product = require('../model/productModel');
const User = require('../model/userModel');

class BidsManager {
  // Get the highest bid for an auction from manual bids
  static async getHighestBid(auctionId) {
    const highestManualBid = await ManualBid.findOne({ auctionId })
      .sort({ amount: -1, createdAt: -1 })
      .limit(1);

    if (!highestManualBid) {
      return null;
    }

    return highestManualBid;
  }

  // Get recent bids for an auction
  static async getRecentBids(auctionId, limit = 50) {
    // Get manual bids
    const manualBids = await ManualBid.find({ auctionId })
      .sort({ createdAt: -1 })
      .limit(limit);

    // Format bids for client consumption
    const formattedBids = await Promise.all(manualBids.map(async (bid) => {
      // Get bidder info
      let bidderName = 'Unknown';
      const bidder = await User.findById(bid.userId).select('name');
      if (bidder) bidderName = bidder.name;

      return {
        currentBid: bid.amount,
        currentBidder: {
          id: bid.userId,
          name: bidderName
        },
        timestamp: bid.createdAt.toISOString(),
        isAutoBid: false
      };
    }));

    return formattedBids;
  }

  // Create a new manual bid
  static async createManualBid(auctionId, userId, amount, session = null) {
    // Create the new bid
    const newBid = new ManualBid({
      auctionId,
      userId,
      amount
    });

    await newBid.save({ session });

    // Update auction with the new highest bid
    await Product.findByIdAndUpdate(
      auctionId,
      {
        currentBid: amount,
        currentBidder: userId,
        lastBidId: newBid._id
      },
      { session }
    );

    return newBid;
  }

  // Process auto bids after a new manual bid
  static async processAutoBids(auctionId, currentBid, currentBidderId, session = null) {
    // Get all active auto bids for this auction except the current bidder's
    const autoBidSettings = await AutoBidding.find({
      auctionId,
      userId: { $ne: currentBidderId },
      enabled: true,
      maxAmount: { $gt: currentBid } // Only consider auto bids that can still go higher
    }).sort({ maxAmount: -1 }); // Sort by max amount desc

    if (autoBidSettings.length === 0) {
      return null; // No auto bids to process
    }

    // Get the auto bid with the highest max amount
    const highestAutoBid = autoBidSettings[0];

    // If there's more than one auto bid
    if (autoBidSettings.length > 1) {
      // The second highest auto bid determines the bid amount for the highest
      const secondHighestAutoBid = autoBidSettings[1];

      // Calculate the new bid amount for the highest auto bidder
      const newBidAmount = Math.min(
        highestAutoBid.maxAmount,
        secondHighestAutoBid.maxAmount + highestAutoBid.increment
      );

      // If the new bid amount is higher than the current bid
      if (newBidAmount > currentBid) {
        // Create a manual bid record for this auto bid
        const newBid = await this.createManualBid(
          auctionId,
          highestAutoBid.userId,
          newBidAmount,
          session  // ← Pass session
        );

        return {
          bid: newBid,
          userId: highestAutoBid.userId,
          amount: newBidAmount,
          isAutoBid: true
        };
      }
    } else {
      // Only one auto bid, so it just needs to be higher than the current bid
      const newBidAmount = Math.min(
        highestAutoBid.maxAmount,
        currentBid + highestAutoBid.increment
      );

      // If the new bid amount is higher than the current bid
      if (newBidAmount > currentBid) {
        // Create a manual bid record for this auto bid
        const newBid = await this.createManualBid(
          auctionId,
          highestAutoBid.userId,
          newBidAmount,
          session  // ← Add session here too
        );

        return {
          bid: newBid,
          userId: highestAutoBid.userId,
          amount: newBidAmount,
          isAutoBid: true
        };
      }
    }

    return null; // No auto bids were processed
  }

  // Calculate minimum bid amounts
  static async calculateMinimumBids(auctionId, currentBid) {
    // Get all active auto bids for this auction
    const autoBidSettings = await AutoBidding.find({
      auctionId,
      enabled: true
    }).sort({ maxAmount: -1 }); // Sort by max amount desc

    let minManualBid = currentBid + 5000; // Default increment
    let minAutoBidAmount = 0;

    // If there are auto-bids, calculate minimum manual bid
    if (autoBidSettings.length > 0) {
      // Highest auto-bid
      const highestAutoBid = autoBidSettings[0];

      if (autoBidSettings.length > 1) {
        // Second highest auto-bid + increment
        const secondHighest = autoBidSettings[1];
        minManualBid = Math.max(minManualBid, secondHighest.maxAmount + 5000);
      } else {
        // Only one auto-bid, just use current + increment
        minManualBid = Math.max(minManualBid, currentBid + 5000);
      }

      // Set minimum for new auto-bids (must be higher than existing highest)
      minAutoBidAmount = highestAutoBid.maxAmount + 1;
    }

    return {
      minManualBid,
      minAutoBidAmount
    };
  }
}

module.exports = BidsManager;