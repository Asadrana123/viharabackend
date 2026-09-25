const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const Product = require("../../model/property/productModel");
const ManualBid = require("../../model/bidding/manualBiddingModel");
const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const User = require("../../model/users/userModel");
const BidsManager = require("../../utils/bidsManager");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const {
  renderAuctionReportPdf,
  buildAuctionReportWorkbook,
  buildReportFilename,
  renderAuctionReportPdfBuffer,
  buildAuctionReportExcelBuffer
} = require("../../utils/sellerReportExport");
const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");
const sendEmail = require("../../utils/sendEmail");
const getSellerAuctionClosedEmailTemplate = require("../../htmlPages/bidding/sellerAuctionClosedEmail");
const AuctionRound = require("../../model/bidding/auctionRoundModel");
const { roundStatus } = require("../../services/bidding/auctionRoundService");

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

// ---------- auction rounds ----------
// A property can be auctioned many times. Every endpoint below takes an optional
// ?roundId= to show a past auction; without it they show the current round.

// Resolve the round a request is about. `round` is null for a property that
// predates rounds (its bids are then matched by property alone).
async function resolveRound(product, roundId) {
  if (roundId) {
    if (!mongoose.Types.ObjectId.isValid(roundId)) {
      return { error: { code: 400, message: "Invalid auction round ID" } };
    }
    const round = await AuctionRound.findOne({ _id: roundId, productId: product._id });
    return round ? { round } : { error: { code: 404, message: "Auction round not found" } };
  }
  const round = product.currentRoundId ? await AuctionRound.findById(product.currentRoundId) : null;
  return { round };
}

function bidFilterFor(product, round) {
  return round ? { auctionId: product._id, roundId: round._id } : { auctionId: product._id };
}

// A closed round keeps its own terms; an open one reads the property's live values.
function roundTerms(product, round) {
  const src = round && round.closedAt ? round : product;
  return {
    auctionStartDate: src.auctionStartDate || null,
    auctionEndDate: src.auctionEndDate || null,
    reservePrice: src.reservePrice ?? null,
    startBid: src.startBid ?? null,
    minIncrement: src.minIncrement ?? null
  };
}

function roundSummary(product, round) {
  if (!round) return null;
  return {
    id: round._id,
    roundNumber: round.roundNumber,
    status: roundStatus(round, product),
    isCurrent: String(product.currentRoundId) === String(round._id)
  };
}

// Registrations for a round: a closed round uses the list saved when it closed;
// an open round uses the live list. Rejected registrations are always excluded.
async function roundRegistrations(product, round, { approvedOnly = false } = {}) {
  if (round && round.closedAt) {
    return (round.registrations || [])
      .filter((r) => r.status !== "rejected" && (!approvedOnly || r.status === "approved"))
      .map((r) => ({
        id: r.registrationId,
        name: r.name || "Unknown",
        buyerType: r.buyerType || "",
        status: r.status || "pending",
        submittedAt: r.submittedAt
      }));
  }
  const regs = await AuctionRegistration.find({
    auctionId: product._id,
    status: approvedOnly ? "approved" : { $ne: "rejected" }
  })
    .select("firstName lastName buyerType status submittedAt")
    .sort({ submittedAt: -1 })
    .lean();
  return regs.map((r) => ({
    id: r._id,
    name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || "Unknown",
    buyerType: r.buyerType || "",
    status: r.status || "pending",
    submittedAt: r.submittedAt
  }));
}

function countRegistrations(list) {
  const counts = { total: 0, approved: 0, pending: 0 };
  list.forEach((r) => {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
    counts.total += 1;
  });
  return counts;
}

// Get all auctions the requester can view.
// - Seller: only the properties assigned to them.
// - Admin: every property (admins may inspect any seller dashboard).
exports.getSellerAuctions = catchAsyncError(async (req, res, next) => {
  const isAdmin = req.user.role === "admin";
  const filter = isAdmin ? {} : { sellerIds: req.user._id };

  const auctions = await Product.find(filter)
    .select("productName city state street status currentBid auctionEndDate currentRoundId")
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
    .select("productName city state street currentBid currentRoundId auctionStartDate auctionEndDate");

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const { round, error } = await resolveRound(auction, req.query.roundId);
  if (error) return next(new ErrorHandler(error.message, error.code));

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Exclude house/admin bids — sellers only see real bidder activity.
  const excludedBidderIds = await getExcludedBidderIds();
  const bidFilter = { ...bidFilterFor(auction, round), userId: { $nin: excludedBidderIds } };

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
      currentBid: round && round.closedAt ? round.highestBid : auction.currentBid
    },
    round: roundSummary(auction, round),
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
    "minIncrement emd investmentData.valuation currentRoundId"
  );

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const { round, error } = await resolveRound(auction, req.query.roundId);
  if (error) return next(new ErrorHandler(error.message, error.code));
  const terms = roundTerms(auction, round);

  // Registration status breakdown (rejected excluded). A closed round counts
  // the list saved when it closed.
  const registrations = countRegistrations(await roundRegistrations(auction, round));

  // Highest bid shown to the seller is the top bid by a real bidder
  // (house/admin accounts excluded).
  const excludedBidderIds = await getExcludedBidderIds();
  const topUserBid = await ManualBid.findOne({ ...bidFilterFor(auction, round), userId: { $nin: excludedBidderIds } })
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
      auctionStartDate: terms.auctionStartDate,
      auctionEndDate: terms.auctionEndDate,
      reservePrice: terms.reservePrice,
      startBid: terms.startBid,
      highestBid,
      minIncrement: terms.minIncrement,
      emd: auction.emd,
      viharaValue: auction.investmentData?.valuation?.ViharaValue ?? null
    },
    round: roundSummary(auction, round),
    registrations
  });
});

// Auction history for one property: every round, newest first, with its
// dates, highest bid, winner and bid count. Same access rule as above. Bid
// figures exclude house/admin accounts, like the rest of the seller dashboard.
exports.getSellerAuctionRounds = catchAsyncError(async (req, res, next) => {
  const { auctionId } = req.params;
  const isAdmin = req.user.role === "admin";

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return next(new ErrorHandler("Invalid auction ID", 400));
  }

  const query = isAdmin
    ? { _id: auctionId }
    : { _id: auctionId, sellerIds: req.user._id };

  const auction = await Product.findOne(query).select(
    "currentRoundId auctionStartDate auctionEndDate currentBid currentBidder"
  );

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const rounds = await AuctionRound.find({ productId: auction._id })
    .sort({ roundNumber: -1 })
    .lean();

  const excludedBidderIds = await getExcludedBidderIds();
  const stats = await ManualBid.aggregate([
    {
      $match: {
        auctionId: auction._id,
        roundId: { $in: rounds.map((r) => r._id) },
        userId: { $nin: excludedBidderIds }
      }
    },
    { $group: { _id: "$roundId", highestBid: { $max: "$amount" }, totalBids: { $sum: 1 } } }
  ]);
  const statsByRound = {};
  stats.forEach((st) => { statsByRound[String(st._id)] = st; });

  const result = rounds.map((r) => {
    const st = statsByRound[String(r._id)] || {};
    const terms = roundTerms(auction, r);
    return {
      id: r._id,
      roundNumber: r.roundNumber,
      status: roundStatus(r, auction),
      isCurrent: String(auction.currentRoundId) === String(r._id),
      auctionStartDate: terms.auctionStartDate,
      auctionEndDate: terms.auctionEndDate,
      highestBid: st.highestBid ?? null,
      totalBids: st.totalBids || 0,
      winnerName: r.closedAt ? r.winnerName || null : null
    };
  });

  return res.status(200).json({
    success: true,
    rounds: result
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

  const auction = await Product.findOne(query).select("_id currentRoundId");

  if (!auction) {
    return isAdmin
      ? next(new ErrorHandler("Auction not found", 404))
      : next(new ErrorHandler("Auction not found or you do not have access", 403));
  }

  const { round, error } = await resolveRound(auction, req.query.roundId);
  if (error) return next(new ErrorHandler(error.message, error.code));

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Rejected registrations are hidden from the seller. A closed round shows the
  // list saved when it closed.
  const all = await roundRegistrations(auction, round);
  const total = all.length;
  const formatted = all.slice(skip, skip + parseInt(limit));

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

// Shared field selection so the seller-facing and system-context gathers stay
// identical.
const REPORT_AUCTION_SELECT =
  "productName street city county state zipCode propertyType assetType " +
  "occupancyStatus beds baths squareFootage lotSize yearBuilt apn status " +
  "auctionStartDate auctionEndDate reservePrice startBid minIncrement currentRoundId";

// Build the report object from an already-fetched auction document.
// No access control and no HTTP coupling — callers decide who may see it.
// House accounts excluded; the registration list keeps only admin-approved
// bidders (they are the report's "registered bidders"). `round` picks the
// auction round (null for a property that predates rounds).
async function buildAuctionReport(auction, auctionId, round = null) {
  const excludedBidderIds = await getExcludedBidderIds();
  const bidFilter = { ...bidFilterFor(auction, round), userId: { $nin: excludedBidderIds } };
  const terms = roundTerms(auction, round);

  // Registration counts (rejected excluded).
  const counts = countRegistrations(await roundRegistrations(auction, round));

  // Highest bid by a real bidder (house accounts excluded).
  const topBid = await ManualBid.findOne(bidFilter)
    .sort({ amount: -1 })
    .select("amount")
    .lean();

  // All bids (house accounts excluded), newest first.
  const bidsRaw = await ManualBid.find(bidFilter)
    .sort({ createdAt: -1 });
  const bidsFmt = await BidsManager.formatBidsWithUserInfo(bidsRaw);

  // Approved registrations only, newest first.
  const regs = await roundRegistrations(auction, round, { approvedOnly: true });

  return {
    generatedAt: new Date(),
    timezone: resolvePropertyTimezone(auction),
    roundNumber: round ? round.roundNumber : null,
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
      reservePrice: terms.reservePrice,
      highestBid: topBid ? topBid.amount : null,
      startBid: terms.startBid,
      minIncrement: terms.minIncrement
    },
    window: {
      start: terms.auctionStartDate,
      end: terms.auctionEndDate
    },
    counts,
    bids: bidsFmt.map((b, i) => ({
      index: i + 1,
      bidderName: b.bidderName,
      amount: b.amount,
      createdAt: b.createdAt
    })),
    registrations: regs.map((r, i) => ({
      index: i + 1,
      name: r.name,
      buyerType: r.buyerType,
      status: r.status,
      submittedAt: r.submittedAt
    }))
  };
}

// Seller/admin gather — enforces access (used by the HTTP export endpoints).
// Returns { error } on access failure, otherwise { report }.
async function gatherSellerAuctionReport(req, auctionId) {
  const isAdmin = req.user.role === "admin";

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return { error: { code: 400, message: "Invalid auction ID" } };
  }

  const query = isAdmin
    ? { _id: auctionId }
    : { _id: auctionId, sellerIds: req.user._id };

  const auction = await Product.findOne(query).select(REPORT_AUCTION_SELECT);

  if (!auction) {
    return {
      error: {
        code: isAdmin ? 404 : 403,
        message: isAdmin ? "Auction not found" : "Auction not found or you do not have access"
      }
    };
  }

  const { round, error } = await resolveRound(auction, req.query.roundId);
  if (error) return { error };

  const report = await buildAuctionReport(auction, auctionId, round);
  return { report };
}

// System-context gather — no logged-in user. Used when the auction closes
// automatically and there is no request to authorize against. `roundId` picks
// the auction round (the current one when omitted).
async function gatherAuctionReportById(auctionId, roundId = null) {
  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return { error: { code: 400, message: "Invalid auction ID" } };
  }

  const auction = await Product.findOne({ _id: auctionId }).select(REPORT_AUCTION_SELECT);
  if (!auction) {
    return { error: { code: 404, message: "Auction not found" } };
  }

  const { round, error } = await resolveRound(auction, roundId);
  if (error) return { error };

  const report = await buildAuctionReport(auction, auctionId, round);
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

// Email the full closed-auction report (PDF + Excel) to every assigned seller.
// Called from the socket auction-finalization flow for the round that just
// closed. Sends even when there were no bids, but then without the attachments.
// Fully self-contained and fire-and-forget: it swallows its own errors so it can
// never block or break auction finalization.
exports.sendAuctionClosedSellerReport = async (auctionId, roundId = null) => {
  try {
    const { error, report } = await gatherAuctionReportById(auctionId, roundId);
    if (error) {
      console.error(`Seller report skipped for auction ${auctionId}: ${error.message}`);
      return;
    }

    // Resolve every assigned seller's email from the product's sellerIds array.
    const product = await Product.findById(auctionId).select("sellerIds");
    const sellerIds = (product && product.sellerIds) || [];
    if (!sellerIds.length) {
      console.log(`Auction ${auctionId} has no assigned sellers — report not sent.`);
      return;
    }

    const sellers = await User.find({ _id: { $in: sellerIds } })
      .select("name email")
      .lean();
    const recipients = sellers.filter((s) => s.email);
    if (!recipients.length) {
      console.log(`Auction ${auctionId} sellers have no email on file — report not sent.`);
      return;
    }

    // Attach the report only when the auction received bids. Render both
    // attachments once and reuse them for every recipient.
    let attachments = [];
    if (report.bids.length > 0) {
      const [pdfBuffer, excelBuffer] = await Promise.all([
        renderAuctionReportPdfBuffer(report),
        buildAuctionReportExcelBuffer(report)
      ]);

      const filename = buildReportFilename(report);
      attachments = [
        {
          filename: `${filename}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf"
        },
        {
          filename: `${filename}.xlsx`,
          content: excelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
      ];
    }

    const propertyLabel =
      report.property?.productName || report.property?.location || "your property";
    const subject = `Auction closed — report for ${propertyLabel}`;

    // Send individually so sellers don't see each other's addresses.
    for (const seller of recipients) {
      const html = getSellerAuctionClosedEmailTemplate({
        name: seller.name || "Seller",
        report
      });
      sendEmail(seller.email, seller.name, subject, html, attachments);
    }

    if (roundId) {
      await AuctionRound.updateOne({ _id: roundId }, { $set: { sellerEmailSentAt: new Date() } });
    }

    console.log(
      `Seller auction-closed report sent for ${auctionId} to ${recipients.length} seller(s).`
    );
  } catch (err) {
    console.error(`sendAuctionClosedSellerReport error for auction ${auctionId}:`, err);
  }
};
