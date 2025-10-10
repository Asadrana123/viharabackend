const AuctionRegistration = require("../model/auctionRegistration");
const Product = require("../model/productModel");
const User = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendEmail = require("../utils/sendEmail");

// Submit a registration request for an auction
exports.submitAuctionRegistration = catchAsyncError(
  async (req, res, next) => {
    const { 
      userId, 
      auctionId, 
      buyerInfo, 
      buyerType, 
      companyInfo, 
      legalAgreements
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
      // existingRegistration.buyerInfo = buyerInfo;
      existingRegistration.buyerType = buyerType;
      existingRegistration.companyInfo = companyInfo;
      existingRegistration.legalAgreements = legalAgreements;
      // existingRegistration.bidAmount = bidAmount;
      // existingRegistration.buyersPremium = buyersPremium;
      existingRegistration.status = "approved"; // Reset status to pending if previously rejected
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
      buyerInfo,
      buyerType,
      companyInfo,
      legalAgreements,
      // bidAmount,
      // buyersPremium
    });
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

// Admin: Update registration status
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
      const emailSubject = `Auction Registration ${status === "approved" ? "Approved" : "Update"}`;
      const emailContent = status === "approved" 
        ? `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0384fb; color: white; padding: 10px; text-align: center; }
              .content { padding: 20px; }
              .button { background-color: #0384fb; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; margin: 20px 0; }
              .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Your Auction Registration is Approved!</h2>
              </div>
              <div class="content">
                <p>Good news! Your registration for the following auction has been approved:</p>
                <p><strong>Property:</strong> ${auction.street}, ${auction.city}, ${auction.state}</p>
                <p><strong>Auction End Date:</strong> ${new Date(auction.auctionEndDate).toLocaleDateString()}</p>
                <p>You can now place bids on this property. Good luck!</p>
                <a href="${process.env.CLIENT_URL}/property/${auction._id}" class="button">Go to Auction</a>
                <p>Thank you,<br>Vihara Team</p>
              </div>
              <div class="footer">
                If you have any questions, please contact our support team.
              </div>
            </div>
          </body>
          </html>
        `
        : `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0384fb; color: white; padding: 10px; text-align: center; }
              .content { padding: 20px; }
              .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Auction Registration Status Update</h2>
              </div>
              <div class="content">
                <p>Your registration request for the following auction has been updated:</p>
                <p><strong>Property:</strong> ${auction.street}, ${auction.city}, ${auction.state}</p>
                <p><strong>Status:</strong> ${status.toUpperCase()}</p>
                ${status === "rejected" ? "<p>If you believe this is an error or would like more information, please contact our support team.</p>" : ""}
                <p>Thank you,<br>Vihara Team</p>
              </div>
              <div class="footer">
                If you have any questions, please contact our support team.
              </div>
            </div>
          </body>
          </html>
        `;
      
      sendEmail(
        user.email,
        user.name,
        emailSubject,
        emailContent
      );
    } catch (error) {
      console.error("Error sending status update email:", error);
      // Continue with the process even if email fails
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