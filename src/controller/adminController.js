const adminModel = require("../model/adminModel");
const userModel = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");
const ManualBid = require("../model/manualBiddingModel");
const AutoBidding = require("../model/autoBiddingModel");
const Product = require("../model/productModel");
const mongoose = require('mongoose');
// Create an admin account
exports.CreateAdmin = catchAsyncError(
  async (req, res) => {
    console.log(req.body);
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

    const auction = await Product.findById(auctionId).select('productName street city state');
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const manualBids = await ManualBid.find({ auctionId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalBids = await ManualBid.countDocuments({ auctionId });

    // Batch fetch user info
    const userIds = [...new Set(manualBids.map(b => b.userId.toString()))];
    const users = await userModel.find({ _id: { $in: userIds } }).select('_id name email').lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    // Fetch auto bid user IDs to tag auto bids
    const autoBidUserIds = await AutoBidding.find({ auctionId, enabled: true }).distinct('userId');
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



// Update auction start and end dates (admin only)
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

    const updates = {};
    if (auctionStartDate) {
      const parsedStart = new Date(auctionStartDate);
      if (isNaN(parsedStart.getTime())) {
        return next(new Errorhandler("Invalid auctionStartDate", 400));
      }
      updates.auctionStartDate = parsedStart;
    }
    if (auctionEndDate) {
      const parsedEnd = new Date(auctionEndDate);
      if (isNaN(parsedEnd.getTime())) {
        return next(new Errorhandler("Invalid auctionEndDate", 400));
      }
      updates.auctionEndDate = parsedEnd;
    }

    // Validate: start must be before end
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

    // Emit socket event to update all connected clients in real time
    const io = require('../socket/getIoInstance').getIoInstance();
    if (io) {
      // Update in-memory activeAuctions map via socket broadcast
      io.to(auctionId).emit('auction-dates-updated', {
        auctionStartDate: updatedAuction.auctionStartDate,
        auctionEndDate: updatedAuction.auctionEndDate,
        // frontend timer uses endTime key
        endTime: updatedAuction.auctionEndDate
      });
    }

    res.status(200).json({
      success: true,
      message: "Auction dates updated successfully",
      auction: {
        _id: updatedAuction._id,
        auctionStartDate: updatedAuction.auctionStartDate,
        auctionEndDate: updatedAuction.auctionEndDate
      }
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

    // Broadcast status change to all connected clients in real time
    const io = require('../socket/getIoInstance').getIoInstance();
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