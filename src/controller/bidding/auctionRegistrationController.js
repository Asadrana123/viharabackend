const mongoose = require("mongoose");
const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const AutoBidding = require("../../model/bidding/autoBiddingModel");
const PropertyEmailLead = require("../../model/email/propertyEmailLeadModel");
const { LEAD_TYPES } = require("../../model/leads/leadNoteModel");
const { ALL_LEAD_SOURCES, MODEL_BY_TYPE } = require("../../services/leads/leadModelsByType");
const { getCallsForPhones, normalisePhone } = require("../../services/calling/vapiCallsService");
const { getVtextMessagesForPhones } = require("../../services/vtext/vtextLeadMessagesService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const Product = require("../../model/property/productModel");
const User = require("../../model/users/userModel");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const sendEmail = require("../../utils/sendEmail");
const createRegistrationPendingEmail=require('../../htmlPages/bidding/registrationPendingEmail');
const createRegistrationApprovedEmail=require('../../htmlPages/bidding/registrationApprovedEmail');
const getAdminRegistrationNotificationEmail = require('../../htmlPages/bidding/adminRegistrationNotificationEmail');
const Realtor = require("../../model/users/realtorModel");
const { endFollowUpsForRegistration } = require("../../services/vtext/vtextFollowUpEnd");
const createRealtorNewLeadEmail = require('../../htmlPages/users/realtorNewLeadEmail');
const { trackEvent } = require("../../services/integrations/brevoService");
const {
  isSequenceOn,
  onAuctionRegistration,
  sendPartnerReferralEmail,
  onVerificationChange,
} = require("../../services/propertyEmail/propertyEmailService");

const FRONTEND_URL = "https://vihara.ai";

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

// Vihara x Brevo handoff, event 2: buyer_registered. Fired once, the moment a
// registration is first attributed to a referring realtor (mirrors
// notifyRealtorNewLead's "newly attributed" gating so it never double-fires
// on repeat registration checks). Lands on the REALTOR's Brevo contact, same
// as property_shared, since both events drive the realtor referral funnel.
function trackBuyerRegistered(realtor, { buyerId, buyerEmail, auction }) {
  if (!realtor) return;
  const referralUrl = auction?.slug
    ? `${FRONTEND_URL}/listing/${auction.slug}?ref=${encodeURIComponent(realtor.slug)}`
    : null;

  trackEvent({
    eventName: "buyer_registered",
    email: realtor.email,
    eventProperties: {
      realtor_id: String(realtor._id),
      realtor_email: realtor.email,
      buyer_id: buyerId ? String(buyerId) : null,
      buyer_email: buyerEmail || null,
      property_id: auction?._id ? String(auction._id) : null,
      referral_url: referralUrl,
      timestamp: new Date().toISOString()
    }
  }).catch((e) => console.error("[brevo] buyer_registered event failed:", e.message));
}

// Submit a registration request for an auction
// Someone who registers to bid needs no more "register now" texts from Vtext. Never blocks or fails the registration.
const stopVtextFollowUps = ({ auctionId, mobilePhone, email }) =>
  endFollowUpsForRegistration({ auctionId, mobilePhone, email }).catch((err) =>
    console.error("[vtext] stopping follow-ups after registration failed:", err.message)
  );

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
      stopVtextFollowUps({ auctionId, mobilePhone, email });

      if (existingRegistration.status === "approved") {
        // First-touch attribution: stamp only if not already attributed.
        if (attribution && !existingRegistration.realtorId) {
          existingRegistration.realtorId = attribution.realtorId;
          existingRegistration.showcaseSlug = attribution.showcaseSlug;
          existingRegistration.attributionSource = attribution.attributionSource;
          existingRegistration.attributedAt = attribution.attributedAt;
          await existingRegistration.save();
          if (isSequenceOn(auction)) {
            sendPartnerReferralEmail({ property: auction, registration: existingRegistration, realtor: attributionRealtor });
          } else {
            notifyRealtorNewLead(attributionRealtor, { firstName, lastName, buyerType, auction });
          }
          trackBuyerRegistered(attributionRealtor, { buyerId: userId, buyerEmail: email, auction });
        }
        return res.status(200).json({
          success: true,
          message: "You are already approved for this auction",
          registration: existingRegistration,
          isApproved: true
        });
      }

      // If already registered but pending or rejected, update the details only.
      // The status is NOT changed here: only the team approves a registrant
      // (updateRegistrationStatus), after checking ID and proof of funds.
      existingRegistration.firstName = firstName;
      existingRegistration.lastName = lastName;
      existingRegistration.email = email;
      existingRegistration.mobilePhone = mobilePhone;
      existingRegistration.buyerType = buyerType;
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
        if (!isSequenceOn(auction)) notifyRealtorNewLead(attributionRealtor, { firstName, lastName, buyerType, auction });
        trackBuyerRegistered(attributionRealtor, { buyerId: userId, buyerEmail: email, auction });
      }

      // Backend email sequence (R1 if they never got it, PT1 if newly
      // attributed). A rejected registrant gets nothing: the team follows up
      // by phone. No-op unless the sequence is on for this property.
      if (existingRegistration.status !== "rejected") {
        onAuctionRegistration({
          property: auction,
          registration: existingRegistration,
          realtor: newlyAttributed ? attributionRealtor : null,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Registration updated. You can bid once our team has verified it.",
        registration: existingRegistration,
        isApproved: false
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

    stopVtextFollowUps({ auctionId, mobilePhone, email });

    // Notify the referring realtor of the new attributed lead (fire-and-forget).
    const sequenceOn = isSequenceOn(auction);
    if (attribution) {
      if (!sequenceOn) notifyRealtorNewLead(attributionRealtor, { firstName, lastName, buyerType, auction });
      trackBuyerRegistered(attributionRealtor, { buyerId: userId, buyerEmail: email, auction });
    }

    // Backend email sequence: R1 + Slack alert + PT1 replace the old pending
    // email and realtor email for this property. Never throws.
    if (sequenceOn) {
      onAuctionRegistration({ property: auction, registration, realtor: attributionRealtor });
    }

    // Send pending approval email to user (old setup, sequence off)
    if (!sequenceOn) try {
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
      isApproved: false
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
//   ?auctionId=  → one property's registrations
//   ?limit=all   → every match in one response (the admin view scrolls)
exports.getAllRegistrations = catchAsyncError(
  async (req, res, next) => {
    const { status, auctionId, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (auctionId) {
      if (!mongoose.Types.ObjectId.isValid(auctionId)) {
        return next(new Errorhandler("Invalid auctionId", 400));
      }
      query.auctionId = auctionId;
    }

    const all = limit === "all";
    const perPage = all ? 0 : Math.max(1, parseInt(limit) || 10);
    const pageNum = all ? 1 : Math.max(1, parseInt(page) || 1);

    let find = AuctionRegistration.find(query)
      .populate('userId', 'name email')
      .populate('auctionId', 'productName street city state image')
      .populate('realtorId', 'name slug')
      .sort({ submittedAt: -1, _id: -1 });
    if (!all) find = find.skip((pageNum - 1) * perPage).limit(perPage);

    const [registrations, total] = await Promise.all([
      find,
      AuctionRegistration.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      registrations,
      pagination: {
        total,
        page: pageNum,
        pages: all ? 1 : Math.ceil(total / perPage)
      }
    });
  }
);

// Admin: every property that has registrations, with per-status counts.
// Properties with pending requests first, then by latest registration.
exports.getRegistrationProperties = catchAsyncError(
  async (req, res) => {
    const rows = await AuctionRegistration.aggregate([
      {
        $group: {
          _id: "$auctionId",
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          lastAt: { $max: "$submittedAt" },
        },
      },
      { $sort: { pending: -1, lastAt: -1 } },
    ]);

    const products = await Product.find({ _id: { $in: rows.map((r) => r._id) } })
      .select("productName street city state image status auctionStartDate auctionEndDate")
      .lean();
    const productById = new Map(products.map((p) => [String(p._id), p]));

    const totals = { total: 0, pending: 0, approved: 0, rejected: 0 };
    const properties = rows.map(({ _id, ...counts }) => {
      Object.keys(totals).forEach((k) => { totals[k] += counts[k] || 0; });
      return { auctionId: _id, property: productById.get(String(_id)) || null, ...counts };
    });

    res.status(200).json({ success: true, properties, totals });
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

    // Backend email sequence: R2 on approval, close the lead record on
    // rejection. Replaces the old approval email for this property.
    if (isSequenceOn(auction)) {
      onVerificationChange({ property: auction, registration, status });
    } else try {
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
// Admin: permanently delete one registration. The person loses bid access for
// this auction (bidding checks for an approved registration), so their auto-bid
// settings here are removed too. Bids already placed stay in the auction record.
exports.deleteRegistration = catchAsyncError(
  async (req, res, next) => {
    const registration = await AuctionRegistration.findByIdAndDelete(req.params.id).lean();
    if (!registration) {
      return next(new Errorhandler("Registration not found", 404));
    }

    await Promise.all([
      AutoBidding.deleteMany({ userId: registration.userId, auctionId: registration.auctionId }),
      // Email sequence record: they're no longer registered for this property.
      registration.email
        ? PropertyEmailLead.updateOne(
            { contactEmail: String(registration.email).trim().toLowerCase(), propertyId: registration.auctionId },
            { $set: { registered: false, verificationStatus: null } }
          )
        : null,
    ]);

    res.status(200).json({ success: true, id: String(registration._id) });
  }
);

// Admin: everything we know about the person behind one registration, matched
// by their phone and email — Maya calls (summaries + transcripts), Vtext
// texts, Brevo email events, and every lead signup they made (with its advisor
// notes), so the registration row can show the same picture as a lead.
exports.getRegistrationActivity = catchAsyncError(
  async (req, res, next) => {
    const registration = await AuctionRegistration.findById(req.params.id)
      .select("email mobilePhone userId")
      .populate("userId", "email")
      .lean();
    if (!registration) {
      return next(new Errorhandler("Registration not found", 404));
    }

    // The registration form's email plus the account's, in case they differ.
    const phones = [registration.mobilePhone].map(normalisePhone).filter(Boolean);
    const emails = [registration.email, registration.userId?.email]
      .map((e) => String(e || "").trim().toLowerCase())
      .filter(Boolean);
    const uniquePhones = [...new Set(phones)];
    const uniqueEmails = [...new Set(emails)];

    const [callsByPhone, messagesByPhone, eventsByEmail, leads] = await Promise.all([
      getCallsForPhones(uniquePhones),
      getVtextMessagesForPhones(uniquePhones),
      getEmailEventsForEmails(uniqueEmails),
      findLeadsForPerson(uniquePhones, uniqueEmails),
    ]);

    const byNewest = (key) => (a, b) => new Date(b[key] || 0) - new Date(a[key] || 0);
    res.status(200).json({
      success: true,
      calls: uniquePhones.flatMap((p) => callsByPhone[p] || []).sort(byNewest("startedAt")),
      messages: uniquePhones
        .flatMap((p) => messagesByPhone[p] || [])
        .sort((a, b) => new Date(a.sentAt || 0) - new Date(b.sentAt || 0)),
      emails: uniqueEmails.flatMap((e) => eventsByEmail[e] || []).sort(byNewest("date")),
      leads,
    });
  }
);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every lead record this person has across the lead tabs, newest first, each
 * with its advisor notes. Matched on email (any collection) and on the stored
 * E.164 phone (collections that keep one).
 */
async function findLeadsForPerson(phones, emails) {
  if (!phones.length && !emails.length) return [];
  const emailMatch = emails.map((e) => ({ email: new RegExp(`^${escapeRegex(e)}$`, "i") }));

  const perSource = await Promise.all(
    Object.entries(ALL_LEAD_SOURCES).map(async ([leadType, { model, label }]) => {
      const or = [...emailMatch];
      if (phones.length && model.schema.path("phoneNormalized")) or.push({ phoneNormalized: { $in: phones } });
      if (!or.length) return [];
      try {
        const found = await model.find({ $or: or }).sort({ createdAt: -1 }).limit(10).lean();
        const notesByLead = LEAD_TYPES.includes(leadType)
          ? await getNotesForLeads(leadType, found.map((l) => l._id))
          : {};
        return found.map((l) => ({
          _id: l._id,
          leadType,
          label,
          fullName: l.fullName || l.name || [l.firstName, l.lastName].filter(Boolean).join(" "),
          propertySlug: l.propertySlug || "",
          propertyName: l.propertyName || "",
          callStatus: l.callStatus || null,
          callingStopped: !!l.callingStopped,
          nextCallAt: l.nextCallAt || null,
          hasCalling: !!MODEL_BY_TYPE[leadType],
          notesEnabled: LEAD_TYPES.includes(leadType),
          notes: notesByLead[String(l._id)] || [],
          createdAt: l.createdAt,
        }));
      } catch (err) {
        console.error(`[registration-activity] ${leadType} lookup failed:`, err.message);
        return [];
      }
    })
  );
  return perSource.flat().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

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
