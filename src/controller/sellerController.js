const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const ManualBid = require("../model/manualBiddingModel");
const BidsManager = require("../utils/bidsManager");

// Get all auctions the requester can view.
// - Seller: only the properties assigned to them.
// - Admin: every property (admins may inspect any seller dashboard).
exports.getSellerAuctions = catchAsyncError(async (req, res, next) => {
  const isAdmin = req.user.role === "admin";
  const filter = isAdmin ? {} : { sellerId: req.user._id };

  const auctions = await Product.find(filter)
    .select("productName city state street status currentBid auctionEndDate")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    auctions
  });
});

// Get bids for a specific auction.
// - Seller: only if the auction is assigned to them (otherwise 403).
// - Admin: any auction (404 if it doesn't exist).
exports.getSellerAuctionBids = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const isAdmin = req.user.role === "admin";

  // Admins may view any auction; sellers are restricted to their own.
  const query = isAdmin
    ? { _id: auctionId }
    : { _id: auctionId, sellerId: req.user._id };

  const auction = await Product.findOne(query)
    .select("productName city state street currentBid");

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
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
