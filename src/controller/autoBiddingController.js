// controllers/autoBiddingController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const AutoBidding = require("../model/autoBiddingModel");
const ManualBid = require("../model/manualBiddingModel");
const Product = require("../model/productModel");
const AuctionRegistration = require("../model/auctionRegistration");
const BidsManager = require("../utils/bidsManager");

// Get auto-bidding settings for current user
exports.getAutoBiddingSettings = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params; // auctionId
    const userId = req.user._id;

    // Check if user is registered for this auction
    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId: id,
      status: 'approved'
    });

    if (!registration) {
      return next(new ErrorHandler("You do not have access to this auction", 403));
    }

    const settings = await AutoBidding.findOne({
      userId,
      auctionId: id
    });

    return res.status(200).json({
      success: true,
      data: settings
    });
  }
);

// Save auto-bidding settings
exports.saveAutoBiddingSettings = catchAsyncError(
  async (req, res, next) => {
    const { auctionId, enabled, maxAmount, increment } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!auctionId || maxAmount === undefined) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    // Check if user is registered for this auction
    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId,
      status: 'approved'
    });

    if (!registration) {
      return next(new ErrorHandler("You do not have access to this auction", 403));
    }

    // Get current auction data to validate max amount
    const auction = await Product.findById(auctionId);
    if (!auction) {
      return next(new ErrorHandler("Auction not found", 404));
    }

    // Verify auction is active
    const now = new Date();
    const auctionEnd = auction.auctionEndTime || new Date(auction.auctionEndDate);

    if (now > auctionEnd) {
      return next(new ErrorHandler("This auction has ended", 400));
    }

    const currentBid = auction.currentBid || auction.startBid;
    if (maxAmount <= currentBid) {
      return next(new ErrorHandler("Maximum amount must be higher than current bid", 400));
    }

    // Find existing settings or create new
    let settings = await AutoBidding.findOne({
      userId,
      auctionId
    });

    if (settings) {
      // If settings exist and are enabled, don't allow changes
      if (settings.enabled) {
        return res.status(200).json({
          success: true,
          message: "Auto-bidding already enabled and cannot be modified",
          data: settings
        });
      }

      // Update settings
      settings.enabled = enabled;
      settings.maxAmount = maxAmount;
      settings.increment = increment || 1000;
    } else {
      // Create new settings
      settings = new AutoBidding({
        userId,
        auctionId,
        enabled,
        maxAmount,
        increment: increment || 1000
      });
    }

    await settings.save();

    // If enabled is true, immediately place an auto bid if needed
    if (enabled) {
      try {
        // Check if user is already the highest bidder
        const isHighestBidder = auction.currentBidder && 
                              auction.currentBidder.toString() === userId.toString();
        
        if (!isHighestBidder) {
          // Calculate initial bid amount
          const initialBidAmount = currentBid + (increment || 1000);
          
          // Place the initial bid if it's within the max amount
          if (initialBidAmount <= maxAmount) {
            // Create a manual bid through BidsManager
            const bidCreated = await BidsManager.createManualBid(auctionId, userId, initialBidAmount);
            
            // Update the auction with the new bid info
            await Product.findByIdAndUpdate(auctionId, {
              currentBid: initialBidAmount,
              currentBidder: userId
            });
            
            // Update the response to indicate a bid was placed
            return res.status(200).json({
              success: true,
              message: "Auto-bidding settings saved and initial bid placed",
              data: {
                settings,
                initialBid: initialBidAmount
              }
            });
          }
        }
      } catch (error) {
        console.error('Error placing initial auto bid:', error);
        // Continue with saving settings even if initial bid fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "Auto-bidding settings saved",
      data: settings
    });
  }
);

// Get minimum bid information for an auction
exports.getAutoBiddingInfo = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params; // auctionId
    const userId = req.user._id;

    // Check if user is registered for this auction
    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId: id,
      status: 'approved'
    });

    if (!registration) {
      return next(new ErrorHandler("You do not have access to this auction", 403));
    }

    // Get current auction data
    const auction = await Product.findById(id);
    if (!auction) {
      return next(new ErrorHandler("Auction not found", 404));
    }

    const currentBid = auction.currentBid || auction.startBid;

    // Calculate minimum bids using BidsManager
    const bidLimits = await BidsManager.calculateMinimumBids(id, currentBid);

    return res.status(200).json({
      success: true,
      minManualBid: bidLimits.minManualBid,
      minAutoBidAmount: bidLimits.minAutoBidAmount,
      currentBid
    });
  }
);

// Disable auto-bidding for a user in an auction (only allowed if no active bids)
exports.disableAutoBidding = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params; // auctionId
    const userId = req.user._id;

    // Find existing settings
    const settings = await AutoBidding.findOne({
      userId,
      auctionId: id
    });

    if (!settings) {
      return next(new ErrorHandler("Auto-bidding settings not found", 404));
    }

    // Check if auto-bidding is already enabled
    if (settings.enabled) {
      // Get current auction data
      const auction = await Product.findById(id);
      if (!auction) {
        return next(new ErrorHandler("Auction not found", 404));
      }

      // Check if user is the current highest bidder
      const isHighestBidder = auction.currentBidder && 
                             auction.currentBidder.toString() === userId.toString();
      
      // If user is highest bidder, don't allow disabling auto-bidding
      if (isHighestBidder) {
        return next(new ErrorHandler("Cannot disable auto-bidding when you are the highest bidder", 400));
      }
      
      // Check if user has any bids in this auction
      const userBids = await ManualBid.countDocuments({
        userId,
        auctionId: id
      });
      
      if (userBids > 0) {
        return next(new ErrorHandler("Cannot disable auto-bidding after placing bids", 400));
      }
    }

    // Disable auto-bidding
    settings.enabled = false;
    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Auto-bidding disabled successfully"
    });
  }
);