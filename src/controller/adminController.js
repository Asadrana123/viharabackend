const adminModel = require("../model/adminModel");
const userModel = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");
const ManualBid = require("../model/manualBiddingModel");
const AutoBidding = require("../model/autoBiddingModel");
const Product = require("../model/productModel");

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
