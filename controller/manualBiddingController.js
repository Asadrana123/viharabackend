// controllers/manualBiddingController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const AuctionRegistration = require("../model/auctionRegistration");
const Product = require("../model/productModel");
const ManualBid = require("../model/manualBiddingModel");
const User = require("../model/userModel");
const BidsManager = require("../utils/bidsManager");

// Check if user has access to an auction
exports.checkAuctionAccess = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;

    // Check if auction exists
    const auction = await Product.findById(id);
    if (!auction) {
      return next(new ErrorHandler("Auction not found", 404));
    }

    // Check if auction is active
    const now = new Date();
    
    // Handle the end time properly
    let auctionEnd;
    
    // If auctionEndTime is a full date string
    if (auction.auctionEndTime && auction.auctionEndTime.toString().includes('T')) {
      auctionEnd = new Date(auction.auctionEndTime);
    } 
    // If auctionEndTime is just a time string (like "17:00")
    else if (auction.auctionEndTime && typeof auction.auctionEndTime === 'string') {
      auctionEnd = new Date(auction.auctionEndDate);
      const timeParts = auction.auctionEndTime.split(':');
      if (timeParts.length >= 2) {
        auctionEnd.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
      }
    } 
    // Default to the end date
    else {
      auctionEnd = new Date(auction.auctionEndDate);
    }
    
    console.log('Auction end time determined as:', auctionEnd);

    if (now > auctionEnd) {
      return res.status(200).json({
        success: false,
        error: "This auction has ended"
      });
    }

    // Check if user is registered and approved for this auction
    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId: id,
      status: 'approved'
    });

    if (!registration) {
      return res.status(200).json({
        success: false,
        error: "You do not have access to this auction"
      });
    }

    return res.status(200).json({
      success: true,
      message: "You have access to this auction"
    });
  }
);

// Create a new manual bid (REST API endpoint)
exports.createManualBid = catchAsyncError(
  async (req, res, next) => {
    const { auctionId, amount } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!auctionId || !amount) {
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

    // Get current auction data
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

    // Check if bid amount is valid
    const currentBid = auction.currentBid || auction.startBid;
    if (amount <= currentBid) {
      return next(new ErrorHandler(`Bid must be higher than current bid (${currentBid})`, 400));
    }

    // Calculate minimum bids
    const bidLimits = await BidsManager.calculateMinimumBids(auctionId, currentBid);
    if (amount < bidLimits.minManualBid) {
      return next(new ErrorHandler(`Minimum bid required is ${bidLimits.minManualBid}`, 400));
    }

    // Create manual bid
    try {
      const newBid = await BidsManager.createManualBid(auctionId, userId, amount);

      // Update auction in database
      await Product.findByIdAndUpdate(auctionId, {
        currentBid: amount,
        currentBidder: userId
      });

      // Process any auto bids
      const autoBidResult = await BidsManager.processAutoBids(
        auctionId, 
        amount, 
        userId
      );

      // Return success response
      return res.status(201).json({
        success: true,
        message: "Bid placed successfully",
        data: {
          bidId: newBid._id,
          amount: newBid.amount,
          createdAt: newBid.createdAt,
          outbid: !!autoBidResult // Indicate if user was outbid by an auto-bid
        }
      });
    } catch (error) {
      console.error("Error placing bid:", error);
      return next(new ErrorHandler("Failed to place bid", 500));
    }
  }
);

// Get bid history for an auction
exports.getBidHistory = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const userId = req.user._id;

    // Check if user is registered for this auction
    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId,
      status: 'approved'
    });

    if (!registration) {
      return next(new ErrorHandler("You do not have access to this auction", 403));
    }

    // Get manual bids for this auction with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const bids = await ManualBid.find({ auctionId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalBids = await ManualBid.countDocuments({ auctionId });

    // Format bids for client consumption
    const formattedBids = await BidsManager.formatBidsWithUserInfo(bids);

    return res.status(200).json({
      success: true,
      data: {
        bids: formattedBids,
        pagination: {
          total: totalBids,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalBids / parseInt(limit))
        }
      }
    });
  }
);

// Get bid history for current user across all auctions
exports.getUserBidHistory = catchAsyncError(
  async (req, res, next) => {
    const { limit = 20, page = 1 } = req.query;
    const userId = req.user._id;

    // Get user's bids with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const bids = await ManualBid.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalBids = await ManualBid.countDocuments({ userId });

    // Format bids with auction info
    const formattedBids = await Promise.all(bids.map(async (bid) => {
      const auction = await Product.findById(bid.auctionId)
        .select('propertyType street city state productName currentBid currentBidder');

      // Determine if this is the winning bid
      const isWinningBid = auction && 
                           auction.currentBidder && 
                           auction.currentBidder.toString() === userId.toString() &&
                           auction.currentBid === bid.amount;

      return {
        bidId: bid._id,
        amount: bid.amount,
        createdAt: bid.createdAt,
        auction: auction ? {
          id: auction._id,
          name: auction.productName,
          propertyType: auction.propertyType,
          location: `${auction.street}, ${auction.city}, ${auction.state}`
        } : { id: bid.auctionId, name: 'Unknown Auction' },
        isWinningBid
      };
    }));

    return res.status(200).json({
      success: true,
      data: {
        bids: formattedBids,
        pagination: {
          total: totalBids,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalBids / parseInt(limit))
        }
      }
    });
  }
);

// Get current auction status with bidding data
exports.getAuctionBiddingStatus = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const userId = req.user._id;

    // Check if user is registered for this auction
    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId,
      status: 'approved'
    });

    if (!registration) {
      return next(new ErrorHandler("You do not have access to this auction", 403));
    }

    // Get auction data
    const auction = await Product.findById(auctionId);
    if (!auction) {
      return next(new ErrorHandler("Auction not found", 404));
    }

    // Get user's auto-bidding settings
    const autoBidSettings = await AutoBidding.findOne({
      userId,
      auctionId
    });

    // Get recent bids
    const recentBids = await BidsManager.getRecentBids(auctionId, 10);

    // Get auction status
    const now = new Date();
    const endTime = auction.auctionEndTime || new Date(auction.auctionEndDate);
    let auctionStatus = "ended";
    
    if (now < endTime) {
      auctionStatus = "active";
    }

    // Get current bid and bidder info
    const currentBid = auction.currentBid || auction.startBid;
    let currentBidder = null;
    
    if (auction.currentBidder) {
      const bidderUser = await User.findById(auction.currentBidder).select('name');
      if (bidderUser) {
        currentBidder = {
          id: auction.currentBidder,
          name: bidderUser.name || 'Unknown'
        };
      }
    }

    // Calculate minimum bids
    const bidLimits = await BidsManager.calculateMinimumBids(auctionId, currentBid);

    return res.status(200).json({
      success: true,
      data: {
        auctionStatus,
        endTime,
        currentBid,
        currentBidder,
        minManualBid: bidLimits.minManualBid,
        minAutoBidAmount: bidLimits.minAutoBidAmount,
        isAutoBidding: autoBidSettings?.enabled || false,
        maxAutoBidAmount: autoBidSettings?.maxAmount,
        autoBidIncrement: autoBidSettings?.increment,
        recentBids
      }
    });
  }
);