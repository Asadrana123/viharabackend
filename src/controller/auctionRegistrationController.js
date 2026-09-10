const AuctionRegistration = require("../model/auctionRegistration");
const Product = require("../model/productModel");
const User = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendEmail = require("../utils/sendEmail");
const createRegistrationPendingEmail=require('../htmlPages/registrationPendingEmail');
const createRegistrationApprovedEmail=require('../htmlPages/registrationApprovedEmail');
const getAdminRegistrationNotificationEmail = require('../htmlPages/adminRegistrationNotificationEmail');
const Realtor = require("../model/realtorModel");
const createRealtorNewLeadEmail = require('../htmlPages/realtorNewLeadEmail');

// Resolve a realtor showcase referral (slug) to an APPROVED realtor doc.
// Returns null for a missing / stale / unknown-realtor ref, so a bad referral
// records nothing rather than failing the registration.
async function resolveRealtor(realtorRef) {
  if (!realtorRef) return null;
  const slug = String(realtorRef).trim().toLowerCase();
  if (!slug) return null;
  try {
    return await Realtor.findOne({ slug, status: "approved" }).select("_id slug name email");
  } catch (e) {
    return null;
  }
}

// Fire-and-forget email to the referring realtor when a new lead is attributed.
function notifyRealtorNewLead(realtor, { firstName, lastName, buyerType, auction }) {
  if (!realtor) return;
  try {
    const propertyAddress = [auction.street, auction.city, auction.state].filter(Boolean).join(', ');
    sendEmail(
      realtor.email,
      realtor.name,
      `New lead: ${propertyAddress}`,
      createRealtorNewLeadEmail(
        realtor.name,
        `${firstName || ''} ${lastName || ''}`.trim(),
        buyerType,
        propertyAddress,
        "https://vihara.ai/realtor/dashboard"
      )
    );
  } catch (e) {
    console.error("realtor new-lead email failed:", e);
  }
}

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
      buyerType,
      realtorRef
    } = req.body;

    // Validate the required fields
    if (!firstName || !lastName || !email || !mobilePhone || !buyerType) {
      return next(new Errorhandler("First name, last name, email, phone and buyer type are required", 400));
    }

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

    // Realtor affiliate attribution (null when not referred / unknown realtor).
    const attributionRealtor = await resolveRealtor(realtorRef);
    const attribution = attributionRealtor
      ? {
          realtorId: attributionRealtor._id,
          showcaseSlug: attributionRealtor.slug,
          attributionSource: "realtor_showcase",
          attributedAt: new Date()
        }
      : null;

    // Check if user has already registered for this auction
    const existingRegistration = await AuctionRegistration.findOne({
      userId,
      auctionId
    });

    if (existingRegistration) {
      // If already registered and approved, return success with status
      if (existingRegistration.status === "approved") {
        // First-touch attribution: stamp only if not already attributed.
        if (attribution && !existingRegistration.realtorId) {
          existingRegistration.realtorId = attribution.realtorId;
          existingRegistration.showcaseSlug = attribution.showcaseSlug;
          existingRegistration.attributionSource = attribution.attributionSource;
          existingRegistration.attributedAt = attribution.attributedAt;
          await existingRegistration.save();
          notifyRealtorNewLead(attributionRealtor, { firstName, lastName, buyerType, auction });
        }
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
      existingRegistration.buyerType = buyerType;
      existingRegistration.status = "approved";
      existingRegistration.updatedAt = Date.now();

      // First-touch attribution: stamp only if not already attributed.
      let newlyAttributed = false;
      if (attribution && !existingRegistration.realtorId) {
        existingRegistration.realtorId = attribution.realtorId;
        existingRegistration.showcaseSlug = attribution.showcaseSlug;
        existingRegistration.attributionSource = attribution.attributionSource;
        existingRegistration.attributedAt = attribution.attributedAt;
        newlyAttributed = true;
      }

      await existingRegistration.save();

      if (newlyAttributed) {
        notifyRealtorNewLead(attributionRealtor, { firstName, lastName, buyerType, auction });
      }

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
      firstName,
      lastName,
      email,
      mobilePhone,
      buyerType,
      ...(attribution || {})
    });

    // Notify the referring realtor of the new attributed lead (fire-and-forget).
    if (attribution) {
      notifyRealtorNewLead(attributionRealtor, { firstName, lastName, buyerType, auction });
    }

    // Send pending approval email to user
    try {
      const emailContent = createRegistrationPendingEmail(
        user.name,
        auction.street,
        auction.city,
        auction.state
      );
      console.log('hi');
      sendEmail(user.email, user.name, "Auction Registration Received", emailContent);
    } catch (error) {
      console.error("Error sending registration pending email:", error);
    }

    // Notify admin about new registration (fire-and-forget)
    try {
      const propertyAddress = [auction.street, auction.city, auction.state].filter(Boolean).join(', ');
      const adminHtml = getAdminRegistrationNotificationEmail({
        userName: user.name,
        userEmail: user.email,
        phone: mobilePhone,
        buyerType,
        propertyAddress,
        auctionId
      });
      sendEmail('vin@vihara.ai', 'Vihara Admin', `New Registration: ${propertyAddress}`, adminHtml);
    } catch (error) {
      console.error("Error sending admin registration notification:", error);
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
      .populate('auctionId', 'productName street city state')
      .populate('realtorId', 'name slug')
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
