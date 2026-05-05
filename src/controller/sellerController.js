const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const ManualBid = require("../model/manualBiddingModel");
const BidsManager = require("../utils/bidsManager");

// Get all auctions where the logged-in user is the seller
exports.getSellerAuctions = catchAsyncError(async (req, res, next) => {
  const sellerId = req.user._id;

  const auctions = await Product.find({ sellerId })
    .select("productName city state street status currentBid auctionEndDate")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    auctions
  });
});

// Get bids for a specific auction — only if the logged-in user is the seller
exports.getSellerAuctionBids = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const sellerId = req.user._id;

  // Verify this auction belongs to the seller
  const auction = await Product.findOne({ _id: auctionId, sellerId })
    .select("productName city state street currentBid");

  if (!auction) {
    return next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const bids = await ManualBid.find({ auctionId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalBids = await ManualBid.countDocuments({ auctionId });

  const formattedBids = await BidsManager.formatBidsWithUserInfo(bids);

  return res.status(200).json({
    success: true,
    auction: {
      name: auction.productName,
      location: `${auction.street}, ${auction.city}, ${auction.state}`,
      currentBid: auction.currentBid
    },
    bids: formattedBids,
    pagination: {
      total: totalBids,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(totalBids / parseInt(limit))
    }
  });
});
