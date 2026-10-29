const adminModel = require("../../model/users/adminModel");
const userModel = require("../../model/users/userModel");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const sendToken = require("../../utils/getToken");
const ManualBid = require("../../model/bidding/manualBiddingModel");
const AutoBidding = require("../../model/bidding/autoBiddingModel");
const Product = require("../../model/property/productModel");
const Bank = require("../../model/property/bankModel");
const mongoose = require('mongoose');
const BidsManager = require('../../utils/bidsManager');
const { resolvePropertyTimezone, wallClockToUtc, utcToWallClock } = require('../../utils/resolveTimezone');
const { syncAuctionEndTime, syncAuctionStartBid, resetAuctionRoom } = require('../../socket/socketHandlers');
const AuctionRound = require("../../model/bidding/auctionRoundModel");
const { roundFilter, startNewRound } = require('../../services/bidding/auctionRoundService');
const { resetSnapshot: resetBuyerMatchSnapshot } = require('../../services/buyerMatch/buyerMatchService');

// Dates and the starting bid belong to the current auction round. Once that
// round has closed they're history: the admin starts a new auction instead.
async function currentRoundIsClosed(auction) {
  if (!auction.currentRoundId) return false;
  const round = await AuctionRound.findById(auction.currentRoundId).select('closedAt').lean();
  return !!(round && round.closedAt);
}
const ROUND_CLOSED_MESSAGE = "This auction has already closed. Start a new auction to set new dates or prices.";
const { getIoInstance } = require('../../socket/getIoInstance');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendEmailAsync } = require('../../utils/sendEmail');
const getSellerAccessEmail = require('../../htmlPages/seller/sellerAccessEmail');

// Create an admin account
exports.CreateAdmin = catchAsyncError(
  async (req, res) => {
    const adminData = {
      ...req.body,
      role: "admin"
    };
    const newAdmin = await adminModel.create(adminData);
    sendToken(newAdmin, 201, res);
  }
);

exports.LogOut = catchAsyncError(
  async (req, res, next) => {
    res.cookie("token", null, {
      httpOnly: true,
      expires: new Date(Date.now())
    });
    return res.status(200).json({ success: true, message: "Admin Logout successfully" });
  }
);

// Get all users
exports.getAllUsers = catchAsyncError(
  async (req, res) => {
    const users = await userModel.find().select('-password');
    res.status(200).json({
      success: true,
      users
    });
  }
);

// Update user role
exports.updateUserRole = catchAsyncError(
  async (req, res, next) => {
    const { role } = req.body;

    if (!role || !["user", "admin"].includes(role)) {
      return next(new Errorhandler("Invalid role specified", 400));
    }

    const user = await userModel.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user
    });
  }
);

// Delete user
exports.deleteUser = catchAsyncError(
  async (req, res, next) => {
    const user = await userModel.findById(req.params.id);

    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }

    user.active = 0;
    user.deleted_at = Date.now();
    await user.save();

    res.status(200).json({
      success: true,
      message: "User deactivated successfully"
    });
  }
);

// Get bid history for a specific auction (admin)
exports.getAuctionBids = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const auction = await Product.findById(auctionId).select('productName street city state currentRoundId');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Bids of the current auction round only.
    const bidFilter = roundFilter(auction);
    const manualBids = await ManualBid.find(bidFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalBids = await ManualBid.countDocuments(bidFilter);

    // Batch fetch user info
    const userIds = [...new Set(manualBids.map(b => b.userId.toString()))];
    const users = await userModel.find({ _id: { $in: userIds } }).select('_id name email').lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    // Fetch auto bid user IDs to tag auto bids
    const autoBidUserIds = await AutoBidding.find({ ...bidFilter, enabled: true }).distinct('userId');
    const autoBidSet = new Set(autoBidUserIds.map(id => id.toString()));

    const bids = manualBids.map(bid => {
      const user = userMap[bid.userId.toString()];
      return {
        bidId: bid._id,
        bidderName: user?.name || 'Unknown',
        bidderEmail: user?.email || '',
        amount: bid.amount,
        createdAt: bid.createdAt,
        isAutoBid: autoBidSet.has(bid.userId.toString())
      };
    });

    res.status(200).json({
      success: true,
      auction: {
        id: auction._id,
        name: auction.productName,
        location: `${auction.street}, ${auction.city}, ${auction.state}`
      },
      bids,
      pagination: {
        total: totalBids,
        page: parseInt(page),
        pages: Math.ceil(totalBids / parseInt(limit))
      }
    });
  }
);



// Update auction start and end dates (admin only).
// Incoming values are wall-clock strings (e.g. "2026-09-11T11:00"). The zone is
// derived from the property's own location, so the admin edits local time and
// the backend stores the correct UTC instant. Values already carrying an
// offset/Z are preserved as-is (keeps the Manage Auction tab working).
exports.updateAuctionDates = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { auctionStartDate, auctionEndDate } = req.body;

    if (!auctionStartDate && !auctionEndDate) {
      return next(new Errorhandler("At least one date must be provided", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    const auction = await Product.findById(auctionId);
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }
    if (await currentRoundIsClosed(auction)) {
      return next(new Errorhandler(ROUND_CLOSED_MESSAGE, 409));
    }

    const timezone = resolvePropertyTimezone(auction);

    const updates = {};
    if (auctionStartDate) {
      const utc = wallClockToUtc(auctionStartDate, timezone);
      if (!utc) return next(new Errorhandler("Invalid auctionStartDate", 400));
      updates.auctionStartDate = utc;
    }
    if (auctionEndDate) {
      const utc = wallClockToUtc(auctionEndDate, timezone);
      if (!utc) return next(new Errorhandler("Invalid auctionEndDate", 400));
      updates.auctionEndDate = utc;
    }

    const finalStart = updates.auctionStartDate || auction.auctionStartDate;
    const finalEnd = updates.auctionEndDate || auction.auctionEndDate;
    if (new Date(finalStart) >= new Date(finalEnd)) {
      return next(new Errorhandler("auctionStartDate must be before auctionEndDate", 400));
    }

    const updatedAuction = await Product.findByIdAndUpdate(
      auctionId,
      updates,
      { new: true, runValidators: true }
    );

    // Sync in-memory map so new joiners get fresh endTime immediately
    if (updates.auctionEndDate) {
      syncAuctionEndTime(auctionId, updatedAuction.auctionEndDate);
    }

    // Emit to all connected clients in real time
    const io = getIoInstance();
    if (io) {
      io.to(auctionId).emit('auction-dates-updated', {
        auctionStartDate: updatedAuction.auctionStartDate,
        auctionEndDate: updatedAuction.auctionEndDate,
        endTime: updatedAuction.auctionEndDate
      });
    }

    res.status(200).json({
      success: true,
      message: "Auction dates updated successfully",
      timezone,
      auction: {
        _id: updatedAuction._id,
        auctionStartDate: updatedAuction.auctionStartDate,
        auctionEndDate: updatedAuction.auctionEndDate,
        auctionStartLocal: utcToWallClock(updatedAuction.auctionStartDate, timezone),
        auctionEndLocal: utcToWallClock(updatedAuction.auctionEndDate, timezone)
      }
    });
  }
);


// Start a new auction for a property (admin only). The current auction must
// have ended; it stays in the property's auction history with its bids and
// result. Registrations carry over — approved bidders can bid again.
// Body: { auctionStartDate, auctionEndDate, startBid, reservePrice?, minIncrement? }.
// Dates are wall-clock strings in the property's timezone, or ISO instants.
exports.startNewAuction = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { auctionStartDate, auctionEndDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    const auction = await Product.findById(auctionId).select('state zipCode reservePrice minIncrement');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    const timezone = resolvePropertyTimezone(auction);
    const start = auctionStartDate ? wallClockToUtc(auctionStartDate, timezone) : null;
    const end = auctionEndDate ? wallClockToUtc(auctionEndDate, timezone) : null;
    if (!start || !end) {
      return next(new Errorhandler("Valid start and end dates are required", 400));
    }
    if (new Date(start) >= new Date(end)) {
      return next(new Errorhandler("The start date must be before the end date", 400));
    }
    if (new Date(end) <= new Date()) {
      return next(new Errorhandler("The end date must be in the future", 400));
    }

    const startBid = Number(req.body.startBid);
    if (!Number.isFinite(startBid) || startBid <= 0) {
      return next(new Errorhandler("Starting bid must be a positive number", 400));
    }
    const reservePrice = req.body.reservePrice === undefined || req.body.reservePrice === ''
      ? auction.reservePrice
      : Number(req.body.reservePrice);
    if (!Number.isFinite(reservePrice) || reservePrice < 0) {
      return next(new Errorhandler("Reserve price must be zero or a positive number", 400));
    }
    const minIncrement = req.body.minIncrement === undefined || req.body.minIncrement === ''
      ? (auction.minIncrement || 1000)
      : Number(req.body.minIncrement);
    if (!Number.isFinite(minIncrement) || minIncrement <= 0) {
      return next(new Errorhandler("Minimum increment must be a positive number", 400));
    }

    let result;
    try {
      result = await startNewRound(
        auctionId,
        { auctionStartDate: start, auctionEndDate: end, startBid, reservePrice, minIncrement },
        req.user?._id || null
      );
    } catch (err) {
      if (err.statusCode) return next(new Errorhandler(err.message, err.statusCode));
      throw err;
    }

    const { product, round } = result;
    resetAuctionRoom(auctionId, {
      auctionStartDate: product.auctionStartDate,
      auctionEndDate: product.auctionEndDate
    });

    res.status(201).json({
      success: true,
      message: `Auction #${round.roundNumber} created`,
      timezone,
      round: {
        id: round._id,
        roundNumber: round.roundNumber
      },
      auction: {
        _id: product._id,
        status: product.status,
        auctionStartDate: product.auctionStartDate,
        auctionEndDate: product.auctionEndDate,
        startBid: product.startBid,
        reservePrice: product.reservePrice,
        minIncrement: product.minIncrement,
        currentBid: product.currentBid
      }
    });
  }
);


// Archive / unarchive a property (admin only). Body: { archived: boolean }.
// Nothing is deleted: the property, its leads and its registrations just move
// out of the admin tabs' main lists into their "Archived" sections.
exports.setAuctionArchived = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }
    if (typeof req.body.archived !== 'boolean') {
      return next(new Errorhandler("archived must be true or false", 400));
    }

    const archived = req.body.archived;
    const updatedAuction = await Product.findByIdAndUpdate(
      auctionId,
      { archived, archivedAt: archived ? new Date() : null },
      { new: true }
    ).select('archived archivedAt');
    if (!updatedAuction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    // Buyer Match caches its property / lead lists; rebuild on the next request.
    resetBuyerMatchSnapshot();

    res.status(200).json({
      success: true,
      message: archived ? "Property archived" : "Property restored",
      auction: updatedAuction
    });
  }
);

exports.updateAuctionStatus = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'sold', 'cancelled', 'pending'];
    if (!status || !validStatuses.includes(status)) {
      return next(new Errorhandler("Invalid status value", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    const updatedAuction = await Product.findByIdAndUpdate(
      auctionId,
      { status },
      { new: true, runValidators: true }
    );
    if (!updatedAuction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    const io = getIoInstance();
    if (io) {
      io.to(auctionId).emit('auction-status-changed', { status });
    }

    res.status(200).json({
      success: true,
      message: "Auction status updated successfully",
      auction: {
        _id: updatedAuction._id,
        status: updatedAuction.status
      }
    });
  }
);


// Update the starting bid (admin only).
// No bids yet -> the starting bid IS the floor, so currentBid moves with it and
//                the live room is refreshed (start-bid-updated + min-bid-update).
// Bids exist  -> only startBid is relabelled; the live currentBid is untouched.
exports.updateAuctionStartBid = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const startBid = Number(req.body.startBid);

    if (!Number.isFinite(startBid) || startBid <= 0) {
      return next(new Errorhandler("startBid must be a positive number", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    const auction = await Product.findById(auctionId).select('currentBid currentBidder currentRoundId');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }
    if (await currentRoundIsClosed(auction)) {
      return next(new Errorhandler(ROUND_CLOSED_MESSAGE, 409));
    }

    const hasBids = await ManualBid.exists(roundFilter(auction));

    const updates = { startBid };
    if (!hasBids) updates.currentBid = startBid;

    const updatedAuction = await Product.findByIdAndUpdate(
      auctionId,
      updates,
      { new: true, runValidators: true }
    );

    // Keep the in-memory auction (if a client is live) consistent
    syncAuctionStartBid(auctionId, {
      startBid,
      currentBid: hasBids ? undefined : startBid
    });

    const io = getIoInstance();
    if (io) {
      io.to(auctionId).emit('start-bid-updated', {
        startBid: updatedAuction.startBid,
        currentBid: updatedAuction.currentBid,
        hasBids: !!hasBids
      });
      const limits = await BidsManager.calculateMinimumBids(auctionId, updatedAuction.currentBid);
      io.to(auctionId).emit('min-bid-update', limits);
    }

    res.status(200).json({
      success: true,
      message: hasBids
        ? "Starting bid updated (live current bid left unchanged — bids already exist)"
        : "Starting bid updated",
      auction: {
        _id: updatedAuction._id,
        startBid: updatedAuction.startBid,
        currentBid: updatedAuction.currentBid
      }
    });
  }
);


// Update the reserve price (admin only). The reserve is confidential, so
// nothing is broadcast to the live room. An open round reads the property's
// live reserve; a closed round keeps its own, so editing is blocked there.
exports.updateAuctionReservePrice = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const reservePrice = req.body.reservePrice === '' || req.body.reservePrice == null
      ? NaN
      : Number(req.body.reservePrice);

    if (!Number.isFinite(reservePrice) || reservePrice < 0) {
      return next(new Errorhandler("reservePrice must be zero or a positive number", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    const auction = await Product.findById(auctionId).select('currentRoundId');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }
    if (await currentRoundIsClosed(auction)) {
      return next(new Errorhandler(ROUND_CLOSED_MESSAGE, 409));
    }

    const updatedAuction = await Product.findByIdAndUpdate(
      auctionId,
      { reservePrice },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Reserve price updated",
      auction: {
        _id: updatedAuction._id,
        reservePrice: updatedAuction.reservePrice
      }
    });
  }
);


// ============================================================================
// SELLER ASSIGNMENT (admin only)
// A property can be assigned to MULTIPLE sellers. A non-admin user can open a
// property's bids page only if their id is in that property's sellerIds array —
// every other property returns 403 from the seller controller, which the UI
// surfaces as "you don't have access".
// ============================================================================

// List every property with its currently assigned seller (name + email) so the
// admin can see, at a glance, who owns which property.
exports.getAuctionsWithSellers = catchAsyncError(
  async (req, res) => {
    const auctions = await Product.find()
      .select('productName street city state status archived sellerIds bankId createdAt')
      .populate('sellerIds', 'name email')
      .populate('bankId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      auctions
    });
  }
);

// Assign a seller to a property by email (ADD — a property may have many sellers).
// - The email must belong to an existing registered user (we never auto-create).
// - A plain 'user' is promoted to 'seller'; an existing admin keeps 'admin'.
// - $addToSet keeps the operation idempotent: assigning the same seller twice is
//   a no-op rather than a duplicate.
// - Uses findByIdAndUpdate so no pre-save hook (password re-hash / slug
//   regeneration) is triggered.
exports.assignSeller = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { email } = req.body;

    if (!email || !String(email).trim()) {
      return next(new Errorhandler("Seller email is required", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    const auction = await Product.findById(auctionId).select('_id productName sellerIds');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    const trimmed = String(email).trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const user = await userModel.findOne({
      email: { $regex: `^${escaped}$`, $options: "i" }
    }).select('_id name email role active');

    if (!user) {
      return next(new Errorhandler("No registered user found with that email", 404));
    }
    if (user.active === 0) {
      return next(new Errorhandler("That user account is deactivated", 400));
    }

    const alreadyAssigned = (auction.sellerIds || [])
      .some((id) => id.toString() === user._id.toString());

    // Promote a normal user to seller. Never downgrade an admin.
    if (user.role === 'user') {
      await userModel.findByIdAndUpdate(
        user._id,
        { role: 'seller' },
        { runValidators: true }
      );
    }

    // $addToSet: add without creating duplicates.
    await Product.findByIdAndUpdate(
      auctionId,
      { $addToSet: { sellerIds: user._id } }
    );

    // Return the full, freshly populated seller list so the UI can re-render.
    const updated = await Product.findById(auctionId)
      .select('_id sellerIds')
      .populate('sellerIds', 'name email')
      .lean();

    res.status(200).json({
      success: true,
      message: alreadyAssigned
        ? `${user.email} is already a seller on ${auction.productName}`
        : `Seller assigned to ${auction.productName}`,
      auction: {
        _id: updated._id,
        sellerIds: updated.sellerIds || []
      }
    });
  }
);

// Give a seller access in one step: create their account (or use the existing
// one), assign the chosen properties, and email them the login details with
// each property's auction time, listing link and seller-dashboard link.
// - New account: a random password is generated and sent in the email.
// - Existing account: the password is left alone unless `resetPassword` is
//   true, in which case a new one is generated and sent.
// If the email fails, the response carries the password so the admin can share
// it by hand.
exports.inviteSeller = catchAsyncError(
  async (req, res, next) => {
    const { name, last_name, email, auctionIds, resetPassword } = req.body || {};

    const trimmedEmail = String(email || '').trim().toLowerCase();
    if (!trimmedEmail) {
      return next(new Errorhandler("Seller email is required", 400));
    }
    const ids = Array.isArray(auctionIds) ? [...new Set(auctionIds.map(String))] : [];
    if (!ids.length) {
      return next(new Errorhandler("Choose at least one property", 400));
    }
    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return next(new Errorhandler("Invalid property ID", 400));
    }

    const products = await Product.find({ _id: { $in: ids } })
      .select('_id productName street city state zipCode slug auctionStartDate auctionEndDate')
      .lean();
    if (products.length !== ids.length) {
      return next(new Errorhandler("One or more properties were not found", 404));
    }
    // Keep the order the admin picked them in.
    products.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));

    const escaped = trimmedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let user = await userModel.findOne({
      email: { $regex: `^${escaped}$`, $options: "i" }
    }).select('_id name email role active');

    // 12 characters, no look-alike characters, easy to type from an email.
    const newPassword = () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      return Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join('');
    };

    let password = null;
    let created = false;

    if (!user) {
      const first = String(name || '').trim();
      const last = String(last_name || '').trim();
      if (first.length < 2) {
        return next(new Errorhandler("Enter the seller's first name (at least 2 letters)", 400));
      }
      if (!last) {
        return next(new Errorhandler("Enter the seller's last name", 400));
      }
      password = newPassword();
      // create() runs the pre-save hook, which hashes the password.
      user = await userModel.create({
        name: first,
        last_name: last,
        email: trimmedEmail,
        password,
        role: 'seller',
        email_verified_at: new Date()
      });
      created = true;
    } else {
      if (user.active === 0) {
        return next(new Errorhandler("That user account is deactivated", 400));
      }
      const update = {};
      // Promote a normal user to seller. Never downgrade an admin.
      if (user.role === 'user') update.role = 'seller';
      if (resetPassword) {
        password = newPassword();
        // Hashed here: findByIdAndUpdate skips the pre-save hook.
        update.password = await bcrypt.hash(password, 10);
        update.updated_at = Date.now();
      }
      if (Object.keys(update).length) {
        await userModel.findByIdAndUpdate(user._id, update, { runValidators: true });
      }
    }

    await Product.updateMany(
      { _id: { $in: ids } },
      { $addToSet: { sellerIds: user._id } }
    );

    let emailSent = true;
    try {
      await sendEmailAsync(
        user.email,
        getSellerAccessEmail.subject(products),
        getSellerAccessEmail({ email: user.email, password, properties: products })
      );
    } catch (err) {
      emailSent = false;
      console.error(`Seller access email to ${user.email} failed:`, err);
    }

    // Fresh seller lists for the properties touched, so the UI can re-render.
    const updated = await Product.find({ _id: { $in: ids } })
      .select('_id sellerIds')
      .populate('sellerIds', 'name email')
      .lean();

    const who = created ? 'Account created' : 'Seller added';
    res.status(200).json({
      success: true,
      created,
      emailSent,
      message: emailSent
        ? `${who} and login email sent to ${user.email}`
        : `${who}, but the email to ${user.email} could not be sent`,
      // Only when the email failed — the admin then shares it by hand.
      password: emailSent ? undefined : password,
      auctions: updated.map((a) => ({ _id: a._id, sellerIds: a.sellerIds || [] }))
    });
  }
);

// Remove ONE seller from a property (the target id travels in the request body,
// so the existing DELETE route needs no change). If no sellerId is supplied, all
// sellers are cleared. The user's 'seller' role is intentionally left in place —
// they may still be the seller on other properties.
exports.unassignSeller = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { sellerId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }
    if (sellerId && !mongoose.Types.ObjectId.isValid(sellerId)) {
      return next(new Errorhandler("Invalid seller ID", 400));
    }

    const auction = await Product.findById(auctionId).select('_id productName sellerIds');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    // With a sellerId -> pull just that one. Without -> clear the whole list.
    const update = sellerId
      ? { $pull: { sellerIds: sellerId } }
      : { $set: { sellerIds: [] } };

    await Product.findByIdAndUpdate(auctionId, update);

    const updated = await Product.findById(auctionId)
      .select('_id sellerIds')
      .populate('sellerIds', 'name email')
      .lean();

    res.status(200).json({
      success: true,
      message: sellerId
        ? `Seller removed from ${auction.productName}`
        : `All sellers removed from ${auction.productName}`,
      auction: {
        _id: updated._id,
        sellerIds: updated.sellerIds || []
      }
    });
  }
);

// ============================================================================
// BANK ASSIGNMENT (admin only)
// A property can belong to ONE bank (productModel.bankId). Banks have no login;
// they exist so the admin can view leads, buyer matches and registrations by
// bank. A bank is created the first time its name is typed in.
// ============================================================================

const cleanBankName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

// Every bank with how many properties it owns, A–Z.
exports.getBanks = catchAsyncError(
  async (req, res) => {
    const [banks, counts] = await Promise.all([
      Bank.find().select('_id name').sort({ nameKey: 1 }).lean(),
      Product.aggregate([
        { $match: { bankId: { $ne: null } } },
        { $group: { _id: '$bankId', count: { $sum: 1 } } }
      ])
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));
    res.status(200).json({
      success: true,
      banks: banks.map((b) => ({ ...b, propertyCount: countById.get(String(b._id)) || 0 }))
    });
  }
);

// Set a property's bank. Send { bankId } for an existing bank or { name } to
// use the bank with that name — created if it doesn't exist yet.
exports.assignBank = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    const { bankId, name } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }

    let bank;
    let created = false;
    if (bankId) {
      if (!mongoose.Types.ObjectId.isValid(bankId)) {
        return next(new Errorhandler("Invalid bank ID", 400));
      }
      bank = await Bank.findById(bankId).select('_id name').lean();
      if (!bank) return next(new Errorhandler("Bank not found", 404));
    } else {
      const trimmed = cleanBankName(name);
      if (!trimmed) return next(new Errorhandler("Enter the bank name", 400));
      if (trimmed.length > 100) return next(new Errorhandler("Bank name cannot exceed 100 characters", 400));
      const nameKey = Bank.keyOf(trimmed);
      bank = await Bank.findOne({ nameKey }).select('_id name').lean();
      if (!bank) {
        try {
          bank = (await Bank.create({ name: trimmed, nameKey })).toObject();
          created = true;
        } catch (err) {
          // Two admins typed the same new name at once — use the one that won.
          if (err.code !== 11000) throw err;
          bank = await Bank.findOne({ nameKey }).select('_id name').lean();
        }
      }
    }

    // findByIdAndUpdate: no pre-save hook (slug regeneration) is triggered.
    const auction = await Product.findByIdAndUpdate(
      auctionId,
      { bankId: bank._id },
      { new: true }
    ).select('_id productName');
    if (!auction) return next(new Errorhandler("Auction not found", 404));

    res.status(200).json({
      success: true,
      created,
      message: `${auction.productName} assigned to ${bank.name}`,
      auction: { _id: auction._id, bankId: { _id: bank._id, name: bank.name } }
    });
  }
);

// Clear a property's bank. The bank itself stays (it may own other properties).
exports.unassignBank = catchAsyncError(
  async (req, res, next) => {
    const { auctionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return next(new Errorhandler("Invalid auction ID", 400));
    }
    const auction = await Product.findByIdAndUpdate(
      auctionId,
      { bankId: null },
      { new: true }
    ).select('_id productName');
    if (!auction) return next(new Errorhandler("Auction not found", 404));

    res.status(200).json({
      success: true,
      message: `Bank removed from ${auction.productName}`,
      auction: { _id: auction._id, bankId: null }
    });
  }
);

// Rename a bank (fix a typo). Every property keeps pointing at it.
exports.renameBank = catchAsyncError(
  async (req, res, next) => {
    const { bankId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      return next(new Errorhandler("Invalid bank ID", 400));
    }
    const trimmed = cleanBankName((req.body || {}).name);
    if (!trimmed) return next(new Errorhandler("Enter the bank name", 400));
    if (trimmed.length > 100) return next(new Errorhandler("Bank name cannot exceed 100 characters", 400));

    const nameKey = Bank.keyOf(trimmed);
    const clash = await Bank.findOne({ nameKey, _id: { $ne: bankId } }).select('_id').lean();
    if (clash) return next(new Errorhandler("Another bank already has that name", 400));

    const bank = await Bank.findByIdAndUpdate(
      bankId,
      { name: trimmed, nameKey },
      { new: true }
    ).select('_id name').lean();
    if (!bank) return next(new Errorhandler("Bank not found", 404));

    res.status(200).json({ success: true, message: 'Bank renamed', bank });
  }
);

// Delete a bank and take it off every property it was on.
exports.deleteBank = catchAsyncError(
  async (req, res, next) => {
    const { bankId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      return next(new Errorhandler("Invalid bank ID", 400));
    }
    const bank = await Bank.findByIdAndDelete(bankId).select('_id name').lean();
    if (!bank) return next(new Errorhandler("Bank not found", 404));
    const { modifiedCount } = await Product.updateMany({ bankId }, { bankId: null });

    res.status(200).json({
      success: true,
      message: `${bank.name} deleted${modifiedCount ? ` and removed from ${modifiedCount} propert${modifiedCount === 1 ? 'y' : 'ies'}` : ''}`,
      bankId: bank._id
    });
  }
);
