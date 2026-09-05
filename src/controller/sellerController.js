const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const ManualBid = require("../model/manualBiddingModel");
const AuctionRegistration = require("../model/auctionRegistration");
const User = require("../model/userModel");
const BidsManager = require("../utils/bidsManager");
const { resolvePropertyTimezone } = require("../utils/resolveTimezone");
const {
  renderAuctionReportPdf,
  buildAuctionReportWorkbook,
  buildReportFilename
} = require("../utils/sellerReportExport");
const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

// Seller-dashboard only: house/admin accounts whose bids must not be shown to
// sellers (excluded from the bids list, the bids count, and the highest-bid
// figure). These are normal userModel accounts, so we match them by email
// (case-insensitive). Scoped to this controller — admin and buyer views are
// unaffected.
const SELLER_DASHBOARD_EXCLUDED_BID_EMAILS = [
  "asad@vihara.ai",
  "vin@vihara.ai",
  "trisha@vihara.ai",
  "tvtimes27@gmail.com"
];

// Resolve the excluded house accounts to their userModel _ids for a bid query.
async function getExcludedBidderIds() {
  const pattern = SELLER_DASHBOARD_EXCLUDED_BID_EMAILS
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!pattern) return [];
  return User.find({ email: { $regex: `^(${pattern})$`, $options: "i" } }).distinct("_id");
}

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

  // Exclude house/admin bids — sellers only see real bidder activity.
  const excludedBidderIds = await getExcludedBidderIds();
  const bidFilter = { auctionId, userId: { $nin: excludedBidderIds } };

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

  // Highest bid shown to the seller is the top bid by a real bidder
  // (house/admin accounts excluded).
  const excludedBidderIds = await getExcludedBidderIds();
  const topUserBid = await ManualBid.findOne({ auctionId, userId: { $nin: excludedBidderIds } })
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

// Gather the full report for one auction — the same data (and same filters:
// house accounts excluded, rejected registrations excluded) that the seller
// dashboard shows, but with every bid and registration (no pagination).
// Returns { error } on access failure, otherwise { report }.
async function gatherSellerAuctionReport(req, auctionId) {
  const isAdmin = req.user.role === "admin";

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return { error: { code: 400, message: "Invalid auction ID" } };
  }

  const query = isAdmin
    ? { _id: auctionId }
    : { _id: auctionId, sellerIds: req.user._id };

  const auction = await Product.findOne(query).select(
    "productName street city county state zipCode propertyType assetType " +
    "occupancyStatus beds baths squareFootage lotSize yearBuilt apn status " +
    "auctionStartDate auctionEndDate reservePrice startBid minIncrement"
  );

  if (!auction) {
    return {
      error: {
        code: isAdmin ? 404 : 403,
        message: isAdmin ? "Auction not found" : "Auction not found or you do not have access"
      }
    };
  }

  const excludedBidderIds = await getExcludedBidderIds();

  // Registration counts (rejected excluded).
  const grouped = await AuctionRegistration.aggregate([
    { $match: { auctionId: new mongoose.Types.ObjectId(auctionId), status: { $ne: "rejected" } } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const counts = { total: 0, approved: 0, pending: 0 };
  grouped.forEach((g) => {
    if (g._id && counts[g._id] !== undefined) counts[g._id] = g.count;
    counts.total += g.count;
  });

  // Highest bid by a real bidder (house accounts excluded).
  const topBid = await ManualBid.findOne({ auctionId, userId: { $nin: excludedBidderIds } })
    .sort({ amount: -1 })
    .select("amount")
    .lean();

  // All bids (house accounts excluded), newest first.
  const bidsRaw = await ManualBid.find({ auctionId, userId: { $nin: excludedBidderIds } })
    .sort({ createdAt: -1 });
  const bidsFmt = await BidsManager.formatBidsWithUserInfo(bidsRaw);

  // All registrations (rejected excluded), newest first.
  const regsRaw = await AuctionRegistration.find({ auctionId, status: { $ne: "rejected" } })
    .select("firstName lastName email mobilePhone buyerType status submittedAt")
    .sort({ submittedAt: -1 })
    .lean();

  const report = {
    generatedAt: new Date(),
    timezone: resolvePropertyTimezone(auction),
    property: {
      productName: auction.productName,
      location: `${auction.street}, ${auction.city}, ${auction.state}`,
      zipCode: auction.zipCode,
      propertyType: auction.propertyType,
      assetType: auction.assetType,
      occupancyStatus: auction.occupancyStatus,
      beds: auction.beds,
      baths: auction.baths,
      squareFootage: auction.squareFootage,
      lotSize: auction.lotSize,
      yearBuilt: auction.yearBuilt,
      apn: auction.apn,
      status: auction.status
    },
    terms: {
      reservePrice: auction.reservePrice,
      highestBid: topBid ? topBid.amount : null,
      startBid: auction.startBid,
      minIncrement: auction.minIncrement
    },
    window: {
      start: auction.auctionStartDate || null,
      end: auction.auctionEndDate || null
    },
    counts,
    bids: bidsFmt.map((b, i) => ({
      index: i + 1,
      bidderName: b.bidderName,
      amount: b.amount,
      createdAt: b.createdAt
    })),
    registrations: regsRaw.map((r, i) => ({
      index: i + 1,
      name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || "Unknown",
      buyerType: r.buyerType || "",
      status: r.status || "pending",
      submittedAt: r.submittedAt,
      email: r.email || "",
      phone: r.mobilePhone || ""
    }))
  };

  return { report };
}

// Download the full report as a PDF.
exports.exportSellerAuctionPdf = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const { error, report } = await gatherSellerAuctionReport(req, auctionId);
  if (error) return next(new ErrorHandler(error.message, error.code));

  const filename = buildReportFilename(report);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.on("error", (err) => next(err));
  doc.pipe(res);
  renderAuctionReportPdf(doc, report);
  doc.end();
});

// Download the full report as an Excel workbook.
exports.exportSellerAuctionExcel = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const { error, report } = await gatherSellerAuctionReport(req, auctionId);
  if (error) return next(new ErrorHandler(error.message, error.code));

  const filename = buildReportFilename(report);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);

  const workbook = await buildAuctionReportWorkbook(report);
  await workbook.xlsx.write(res);
  res.end();
});
