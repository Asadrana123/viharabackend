const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const ManualBid = require("../model/manualBiddingModel");
const AuctionRegistration = require("../model/auctionRegistration");
const User = require("../model/userModel");
const BidsManager = require("../utils/bidsManager");
const { resolvePropertyTimezone } = require("../utils/resolveTimezone");
const mongoose = require("mongoose");

// Get all auctions the requester can view.
// - Seller: only the properties assigned to them.
// - Admin: every property (admins may inspect any seller dashboard).
exports.getSellerAuctions = catchAsyncError(async (req, res, next) => {
  const isAdmin = req.user.role === "admin";
  const filter = isAdmin ? {} : { sellerIds: req.user._id };

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
    : { _id: auctionId, sellerIds: req.user._id };

  const auction = await Product.findOne(query)
    .select("productName city state street currentBid");

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Exclude bids placed by admin accounts — sellers only see real user bids.
  const adminIds = await User.find({ role: "admin" }).distinct("_id");
  const bidFilter = { auctionId, userId: { $nin: adminIds } };

  const bids = await ManualBid.find(bidFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalBids = await ManualBid.countDocuments(bidFilter);

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

// Get the full property + auction detail for one auction, plus a registration
// count breakdown (total / approved / pending). Same access rule as the bids
// endpoint: admins see any property, sellers only their assigned ones.
//
// Reserve price is included intentionally — this dashboard is behind seller/admin
// auth, so it is never exposed on a public surface. Every assigned seller of a
// property can see it.
exports.getSellerAuctionDetails = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const isAdmin = req.user.role === "admin";

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return next(new ErrorHandler("Invalid auction ID", 400));
  }

  const query = isAdmin
    ? { _id: auctionId }
    : { _id: auctionId, sellerIds: req.user._id };

  const auction = await Product.findOne(query).select(
    "productName street city county state zipCode propertyType assetType " +
    "occupancyStatus beds baths squareFootage lotSize yearBuilt monthlyHOADues " +
    "apn status auctionStartDate auctionEndDate reservePrice startBid currentBid " +
    "minIncrement emd investmentData.valuation"
  );

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  // One grouped query for the registration status breakdown.
  // Rejected registrations are excluded — they don't count toward the totals.
  const grouped = await AuctionRegistration.aggregate([
    { $match: { auctionId: new mongoose.Types.ObjectId(auctionId), status: { $ne: "rejected" } } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);

  const registrations = { total: 0, approved: 0, pending: 0 };
  grouped.forEach((g) => {
    if (g._id && registrations[g._id] !== undefined) {
      registrations[g._id] = g.count;
    }
    registrations.total += g.count;
  });

  // Highest bid shown to the seller is the top bid by a real user (admins excluded).
  const adminIds = await User.find({ role: "admin" }).distinct("_id");
  const topUserBid = await ManualBid.findOne({ auctionId, userId: { $nin: adminIds } })
    .sort({ amount: -1 })
    .select("amount")
    .lean();
  const highestBid = topUserBid ? topUserBid.amount : null;

  return res.status(200).json({
    success: true,
    auction: {
      _id: auction._id,
      productName: auction.productName,
      location: `${auction.street}, ${auction.city}, ${auction.state}`,
      address: {
        street: auction.street,
        city: auction.city,
        county: auction.county,
        state: auction.state,
        zipCode: auction.zipCode
      },
      propertyType: auction.propertyType,
      assetType: auction.assetType,
      occupancyStatus: auction.occupancyStatus,
      beds: auction.beds,
      baths: auction.baths,
      squareFootage: auction.squareFootage,
      lotSize: auction.lotSize,
      yearBuilt: auction.yearBuilt,
      monthlyHOADues: auction.monthlyHOADues,
      apn: auction.apn,
      status: auction.status,
      // IANA timezone resolved from the property's state + zipCode, so the
      // frontend can render auction/bid/registration times in the property's
      // own local time rather than the viewer's browser timezone.
      timezone: resolvePropertyTimezone(auction),
      auctionStartDate: auction.auctionStartDate,
      auctionEndDate: auction.auctionEndDate,
      reservePrice: auction.reservePrice,
      startBid: auction.startBid,
      highestBid,
      minIncrement: auction.minIncrement,
      emd: auction.emd,
      viharaValue: auction.investmentData?.valuation?.ViharaValue ?? null
    },
    registrations
  });
});

// Get the paginated registrant list for one auction. Same access rule as above.
// Returns bidder name, buyer type, status, submitted time, and contact details —
// every assigned seller may see these (no restriction, per product decision).
exports.getSellerAuctionRegistrations = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const isAdmin = req.user.role === "admin";

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return next(new ErrorHandler("Invalid auction ID", 400));
  }

  const query = isAdmin
    ? { _id: auctionId }
    : { _id: auctionId, sellerIds: req.user._id };

  const auction = await Product.findOne(query).select("_id");

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Rejected registrations are hidden from the seller.
  const regFilter = { auctionId, status: { $ne: "rejected" } };

  const registrations = await AuctionRegistration.find(regFilter)
    .select("firstName lastName email mobilePhone buyerType status submittedAt")
    .sort({ submittedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await AuctionRegistration.countDocuments(regFilter);

  const formatted = registrations.map((r) => ({
    id: r._id,
    name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || "Unknown",
    email: r.email || "",
    phone: r.mobilePhone || "",
    buyerType: r.buyerType || "",
    status: r.status || "pending",
    submittedAt: r.submittedAt
  }));

  return res.status(200).json({
    success: true,
    registrations: formatted,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});
