const AuctionRegistration = require("../model/auctionRegistration");
const Product = require("../model/productModel");
const User = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendEmail = require("../utils/sendEmail");
const { createRegistrationPendingEmail, createRegistrationApprovedEmail } = require("../utils/emailTemplates");
// Submit a registration request for an auction
exports.submitAuctionRegistration = catchAsyncError(
  async (req, res, next) => {
    const {
      userId,
      auctionId,
      firstName,
      lastName,
      email,
      mobilePhone,
      address
      // buyerInfo,
      // buyerType,
      // companyInfo,
      // legalAgreements
      // bidAmount,
      // buyersPremium
    } = req.body;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }

    // Check if auction/product exists
    const auction = await Product.findById(auctionId);
    if (!auction) {
      return next(new Errorhandler("Auction not found", 404));
    }

    // Check if user has already registered for this auction
    const existingRegistration = await AuctionRegistration.findOne({
      userId,
      auctionId
    });

    if (existingRegistration) {
      // If already registered and approved, return success with status
      if (existingRegistration.status === "approved") {
        return res.status(200).json({
          success: true,
          message: "You are already approved for this auction",
          registration: existingRegistration,
          isApproved: true
        });
      }

      // If already registered but pending or rejected, update the registration
      existingRegistration.firstName = firstName;
      existingRegistration.lastName = lastName;
      existingRegistration.email = email;
      existingRegistration.mobilePhone = mobilePhone;
      existingRegistration.address = address || null;
      // existingRegistration.buyerType = buyerType;
      // existingRegistration.companyInfo = companyInfo;
      // existingRegistration.legalAgreements = legalAgreements;
      existingRegistration.status = "approved";
      existingRegistration.updatedAt = Date.now();

      await existingRegistration.save();

      return res.status(200).json({
        success: true,
        message: "Registration request updated successfully",
        registration: existingRegistration,
        isApproved: true
      });
    }

    // Create new registration request
    const registration = await AuctionRegistration.create({
      userId,
      auctionId,
      firstName: firstName,
      lastName: lastName,
      email: email,
      mobilePhone: mobilePhone,
      address: address || null,
      // buyerType,
      // companyInfo,
      // legalAgreements,
      // bidAmount,
      // buyersPremium
    });

    // Send pending approval email
    try {
      const emailContent = createRegistrationPendingEmail(
        user.name,
        auction.street,
        auction.city,
        auction.state
      );
      sendEmail(user.email, user.name, "Auction Registration Received", emailContent);
    } catch (error) {
      console.error("Error sending registration pending email:", error);
    }

    res.status(201).json({
      success: true,
      message: "Registration request submitted successfully",
      registration,
      isApproved: true
    });
  }
);

// Get registration status for a specific auction
exports.getRegistrationStatus = catchAsyncError(
  async (req, res, next) => {
    const { userId, auctionId } = req.query;

    const registration = await AuctionRegistration.findOne({
      userId,
      auctionId
    });
    console.log(registration);
    if (!registration) {
      return res.status(200).json({
        success: true,
        isRegistered: false,
        isApproved: false
      });
    }

    res.status(200).json({
      success: true,
      isRegistered: true,
      isApproved: registration.status === "approved",
      registration
    });
  }
);

// Admin: Get all registration requests (with pagination)
exports.getAllRegistrations = catchAsyncError(
  async (req, res, next) => {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const registrations = await AuctionRegistration.find(query)
      .populate('userId', 'name email')
      .populate('auctionId', 'street city state')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AuctionRegistration.countDocuments(query);

    res.status(200).json({
      success: true,
      registrations,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  }
);

//Admin: Update registration status

exports.updateRegistrationStatus = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return next(new Errorhandler("Invalid status", 400));
    }

    const registration = await AuctionRegistration.findById(id);

    if (!registration) {
      return next(new Errorhandler("Registration not found", 404));
    }

    registration.status = status;
    registration.updatedAt = Date.now();
    await registration.save();

    // Get user and auction details for email notification
    const user = await User.findById(registration.userId);
    const auction = await Product.findById(registration.auctionId);

    // Send email notification to user
    try {
      if (status === "approved") {
        const emailContent = createRegistrationApprovedEmail(
          user.name,
          auction.street,
          auction.city,
          auction.state,
          auction._id
        );
        sendEmail(user.email, user.name, "Auction Registration Approved - Ready to Bid", emailContent);
      }
    } catch (error) {
      console.error("Error sending registration approval email:", error);
    }

    res.status(200).json({
      success: true,
      message: `Registration ${status} successfully`,
      registration
    });
  }
);
// Get all registrations for current user
exports.getUserRegistrations = catchAsyncError(
  async (req, res, next) => {
    const userId = req.user._id;

    const registrations = await AuctionRegistration.find({ userId })
      .populate('auctionId', 'street city state productName auctionEndDate')
      .sort({ submittedAt: -1 });

    res.status(200).json({
      success: true,
      registrations
    });
  }
);