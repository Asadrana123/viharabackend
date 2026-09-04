const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const ManualBid = require("../model/manualBiddingModel");
const AuctionRegistration = require("../model/auctionRegistration");
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
  const grouped = await AuctionRegistration.aggregate([
    { $match: { auctionId: new mongoose.Types.ObjectId(auctionId) } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);

  const registrations = { total: 0, approved: 0, pending: 0, rejected: 0 };
  grouped.forEach((g) => {
    if (g._id && registrations[g._id] !== undefined) {
      registrations[g._id] = g.count;
    }
    registrations.total += g.count;
  });

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
      currentBid: auction.currentBid,
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

  const registrations = await AuctionRegistration.find({ auctionId })
    .select("firstName lastName email mobilePhone buyerType status submittedAt")
    .sort({ submittedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await AuctionRegistration.countDocuments({ auctionId });

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
