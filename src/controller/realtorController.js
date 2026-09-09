const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const realtorModel = require("../model/realtorModel");
const Product = require("../model/productModel");
const getCookieOptions = require("../utils/cookieOptions");
const mongoose = require("mongoose");
const AuctionRegistration = require("../model/auctionRegistration");
const ManualBid = require("../model/manualBiddingModel");
const BidsManager = require("../utils/bidsManager");
const { resolvePropertyTimezone } = require("../utils/resolveTimezone");
const sendEmail = require("../utils/sendEmail");
const createRealtorApplicationReceivedEmail = require("../htmlPages/realtorApplicationReceivedEmail");
const createRealtorApprovedEmail = require("../htmlPages/realtorApprovedEmail");
const createRealtorRejectedEmail = require("../htmlPages/realtorRejectedEmail");
const createRealtorSuspendedEmail = require("../htmlPages/realtorSuspendedEmail");
const PropertyRequest = require("../model/propertyRequestModel");
const createRealtorRequestApprovedEmail = require("../htmlPages/realtorRequestApprovedEmail");
const createRealtorRequestDeclinedEmail = require("../htmlPages/realtorRequestDeclinedEmail");

// Realtor session cookie name. Deliberately separate from the buyer/admin
// `token` cookie so a realtor login never clobbers a buyer session in the same
// browser (JWT carries { id, kind:'realtor' }, verified in middleware/realtorAuth.js).
const REALTOR_COOKIE = "realtorToken";
// Cookie lifetime (7 days). Adjust to match your JWT `expireTime` if you want
// the cookie and token to expire together.
const REALTOR_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const VALID_STATUSES = ["pending", "approved", "rejected", "suspended"];

// Client-safe projection — never leaks password or reset tokens.
function publicRealtor(r) {
  return {
    _id: r._id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    company: r.company ?? null,
    licenseNumber: r.licenseNumber ?? null,
    image: r.image ?? null,
    bio: r.bio ?? null,
    slug: r.slug ?? null,
    status: r.status,
    assignedPropertyIds: r.assignedPropertyIds || [],
    createdAt: r.createdAt
  };
}

function issueRealtorToken(realtor, statusCode, res, message) {
  const token = realtor.getJWTToken();
  const options = { ...getCookieOptions(), maxAge: REALTOR_COOKIE_MAX_AGE };
  return res
    .status(statusCode)
    .cookie(REALTOR_COOKIE, token, options)
    .json({ success: true, message, realtor: publicRealtor(realtor) });
}

// ============================================================================
// REALTOR-FACING  (mounted under /api/v1/realtor)
// ============================================================================

// POST /api/v1/realtor/apply   (public, Req 5)
// Self-application. Creates a realtor in 'pending'. Does NOT log the applicant
// in — access is granted only after an admin approves.
exports.applyRealtor = catchAsyncError(async (req, res, next) => {
  const { name, email, password, phone, company, licenseNumber, bio } = req.body;

  if (!name || !email || !password) {
    return next(new Errorhandler("Name, email and password are required", 400));
  }

  const trimmedEmail = String(email).trim().toLowerCase();
  const existing = await realtorModel.findOne({ email: trimmedEmail });
  if (existing) {
    return next(new Errorhandler("A realtor account with that email already exists", 409));
  }

  const realtor = await realtorModel.create({
    name: String(name).trim(),
    email: trimmedEmail,
    password,
    phone: phone ? String(phone).trim() : null,
    company: company ? String(company).trim() : null,
    licenseNumber: licenseNumber ? String(licenseNumber).trim() : null,
    bio: bio ? String(bio).trim() : null
    // status defaults to 'pending'; slug auto-generates from name in pre-save.
  });

  // Notify the realtor that the application was received (fire-and-forget).
  try {
    sendEmail(
      realtor.email,
      realtor.name,
      "We received your Vihara realtor application",
      createRealtorApplicationReceivedEmail(realtor.name)
    );
  } catch (e) {
    console.error("realtor application email failed:", e);
  }

  return res.status(201).json({
    success: true,
    message:
      "Application submitted. You'll get access once an admin approves your account.",
    realtor: publicRealtor(realtor)
  });
});

// POST /api/v1/realtor/login   (public)
exports.loginRealtor = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new Errorhandler("Please enter email and password", 400));
  }

  const realtor = await realtorModel
    .findOne({ email: String(email).trim().toLowerCase() })
    .select("+password");

  if (!realtor) {
    return next(new Errorhandler("Invalid email or password", 401));
  }

  const matched = await realtor.comparePassword(password);
  if (!matched) {
    return next(new Errorhandler("Invalid email or password", 401));
  }

  // Rejected accounts cannot hold a session at all.
  if (realtor.status === "rejected") {
    return next(new Errorhandler("Your realtor application was not approved", 403));
  }

  // pending / approved / suspended may log in; dashboard DATA endpoints are gated
  // by requireApprovedRealtor (Phase 3), so pending/suspended see a status
  // screen rather than any affiliate data.
  return issueRealtorToken(realtor, 200, res, "Logged in");
});

// POST /api/v1/realtor/logout
exports.logoutRealtor = catchAsyncError(async (req, res, next) => {
  return res
    .status(200)
    .clearCookie(REALTOR_COOKIE, getCookieOptions())
    .json({ success: true, message: "Realtor logout successful" });
});

// GET /api/v1/realtor/me   (realtor auth)
exports.getRealtorMe = catchAsyncError(async (req, res, next) => {
  return res.status(200).json({ success: true, realtor: publicRealtor(req.realtor) });
});

// PUT /api/v1/realtor/me   (realtor auth) — self-edit showcase profile (Req 3).
// Cannot change slug (identity), status (admin only), or email here.
exports.updateRealtorProfile = catchAsyncError(async (req, res, next) => {
  const allowed = ["name", "phone", "company", "licenseNumber", "image", "bio"];
  const realtor = req.realtor;

  allowed.forEach((k) => {
    if (req.body[k] !== undefined) {
      realtor[k] = req.body[k] === null ? null : String(req.body[k]).trim();
    }
  });

  // save() refreshes updatedAt via pre-save. Password is select:false (not
  // loaded) so it isn't touched/re-hashed; slug already exists so it isn't
  // regenerated even if name changes.
  await realtor.save();

  return res.status(200).json({
    success: true,
    message: "Profile updated",
    realtor: publicRealtor(realtor)
  });
});

// ============================================================================
// PUBLIC SHOWCASE  (mounted under /api/v1/realtor, no auth)
// ============================================================================

// GET /api/v1/realtor/showcase/:slug   (public, Req 2, Req 3)
// An APPROVED realtor's public profile + the properties on their showcase.
// Public-safe projection ONLY — reservePrice is NEVER included.
exports.getShowcase = catchAsyncError(async (req, res, next) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) return next(new Errorhandler("Showcase not found", 404));

  const realtor = await realtorModel
    .findOne({ slug, status: "approved" })
    .select("name email phone company licenseNumber image bio slug assignedPropertyIds")
    .lean();

  if (!realtor) return next(new Errorhandler("Showcase not found", 404));

  const ids = realtor.assignedPropertyIds || [];
  const properties = ids.length
    ? await Product.find({ _id: { $in: ids } })
        .select(
          "productName slug street city state zipCode image otherImages beds baths " +
          "squareFootage lotSize yearBuilt propertyType assetType status currentBid " +
          "startBid minIncrement auctionStartDate auctionEndDate investmentData.valuation.ViharaValue"
        )
        .sort({ createdAt: -1 })
        .lean()
    : [];

  return res.status(200).json({
    success: true,
    realtor: {
      name: realtor.name,
      email: realtor.email,
      phone: realtor.phone ?? null,
      company: realtor.company ?? null,
      licenseNumber: realtor.licenseNumber ?? null,
      image: realtor.image ?? null,
      bio: realtor.bio ?? null,
      slug: realtor.slug
    },
    properties: properties.map((p) => ({
      _id: p._id,
      productName: p.productName,
      slug: p.slug || null,
      street: p.street,
      city: p.city,
      state: p.state,
      zipCode: p.zipCode,
      image: p.image || (Array.isArray(p.otherImages) ? p.otherImages[0] : null) || null,
      beds: p.beds,
      baths: p.baths,
      squareFootage: p.squareFootage,
      lotSize: p.lotSize,
      yearBuilt: p.yearBuilt,
      propertyType: p.propertyType,
      assetType: p.assetType,
      status: p.status,
      currentBid: p.currentBid ?? null,
      startBid: p.startBid ?? null,
      minIncrement: p.minIncrement ?? null,
      auctionStartDate: p.auctionStartDate || null,
      auctionEndDate: p.auctionEndDate || null,
      viharaValue: p.investmentData?.valuation?.ViharaValue ?? null
    }))
  });
});

// ============================================================================
// ADMIN-FACING  (mounted under /api/v1/admin; guarded by admin auth in routes)
// ============================================================================

// GET /api/v1/admin/realtors?status=pending   (Req 11)
exports.adminGetRealtors = catchAsyncError(async (req, res, next) => {
  const { status } = req.query;
  const filter = {};
  if (status && VALID_STATUSES.includes(status)) filter.status = status;

  const realtors = await realtorModel
    .find(filter)
    .select("name email phone company licenseNumber slug status assignedPropertyIds createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const shaped = realtors.map((r) => ({
    _id: r._id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    company: r.company ?? null,
    licenseNumber: r.licenseNumber ?? null,
    slug: r.slug ?? null,
    status: r.status,
    assignedCount: (r.assignedPropertyIds || []).length,
    createdAt: r.createdAt
  }));

  return res.status(200).json({ success: true, realtors: shaped });
});

// GET /api/v1/admin/realtor/:id   — one realtor + populated assigned properties.
exports.adminGetRealtor = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new Errorhandler("Invalid realtor ID", 400));
  }

  const realtor = await realtorModel
    .findById(id)
    .select("name email phone company licenseNumber image bio slug status statusNote assignedPropertyIds createdAt")
    .populate("assignedPropertyIds", "productName street city state status slug")
    .lean();

  if (!realtor) return next(new Errorhandler("Realtor not found", 404));

  return res.status(200).json({ success: true, realtor });
});

// PUT /api/v1/admin/realtor/:id/status   body: { status, statusNote? }  (Req 11)
exports.adminUpdateRealtorStatus = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { status, statusNote } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return next(new Errorhandler("Invalid status value", 400));
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new Errorhandler("Invalid realtor ID", 400));
  }

  const realtor = await realtorModel.findById(id);
  if (!realtor) return next(new Errorhandler("Realtor not found", 404));

  const previousStatus = realtor.status;
  realtor.status = status;
  realtor.statusNote = statusNote ? String(statusNote).trim() : null;
  await realtor.save();

  // Notify the realtor when their status actually changes (fire-and-forget).
  if (previousStatus !== realtor.status) {
    try {
      if (realtor.status === "approved") {
        sendEmail(
          realtor.email,
          realtor.name,
          "Your Vihara realtor account is approved",
          createRealtorApprovedEmail(
            realtor.name,
            `https://vihara.ai/realtor/${realtor.slug}`,
            "https://vihara.ai/realtor/login"
          )
        );
      } else if (realtor.status === "rejected") {
        sendEmail(
          realtor.email,
          realtor.name,
          "Update on your Vihara realtor application",
          createRealtorRejectedEmail(realtor.name, realtor.statusNote)
        );
      } else if (realtor.status === "suspended") {
        sendEmail(
          realtor.email,
          realtor.name,
          "Your Vihara realtor account has been suspended",
          createRealtorSuspendedEmail(realtor.name, realtor.statusNote)
        );
      }
    } catch (e) {
      console.error("realtor status email failed:", e);
    }
  }

  return res.status(200).json({
    success: true,
    message: `Realtor ${status}`,
    realtor: {
      _id: realtor._id,
      name: realtor.name,
      email: realtor.email,
      slug: realtor.slug,
      status: realtor.status,
      statusNote: realtor.statusNote
    }
  });
});

// PUT /api/v1/admin/realtor/:id/property   body: { propertyId }   (Req 3, Req 11)
// ADD a property to this realtor's showcase. Idempotent via $addToSet.
exports.adminAssignProperty = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { propertyId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new Errorhandler("Invalid realtor ID", 400));
  }
  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new Errorhandler("Valid propertyId is required", 400));
  }

  const realtor = await realtorModel.findById(id).select("_id name assignedPropertyIds");
  if (!realtor) return next(new Errorhandler("Realtor not found", 404));

  const product = await Product.findById(propertyId).select("_id productName");
  if (!product) return next(new Errorhandler("Property not found", 404));

  const already = (realtor.assignedPropertyIds || [])
    .some((pid) => pid.toString() === product._id.toString());

  // findByIdAndUpdate avoids the pre-save hook; $addToSet prevents duplicates.
  await realtorModel.findByIdAndUpdate(id, {
    $addToSet: { assignedPropertyIds: product._id }
  });

  const updated = await realtorModel
    .findById(id)
    .select("_id assignedPropertyIds")
    .populate("assignedPropertyIds", "productName street city state status slug")
    .lean();

  return res.status(200).json({
    success: true,
    message: already
      ? `${product.productName} is already assigned to ${realtor.name}`
      : `${product.productName} assigned to ${realtor.name}`,
    assignedProperties: updated.assignedPropertyIds || []
  });
});

// DELETE /api/v1/admin/realtor/:id/property   body: { propertyId? }   (Req 11)
// With propertyId -> remove that one. Without -> clear all.
exports.adminUnassignProperty = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { propertyId } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new Errorhandler("Invalid realtor ID", 400));
  }
  if (propertyId && !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new Errorhandler("Invalid property ID", 400));
  }

  const realtor = await realtorModel.findById(id).select("_id name assignedPropertyIds");
  if (!realtor) return next(new Errorhandler("Realtor not found", 404));

  const update = propertyId
    ? { $pull: { assignedPropertyIds: propertyId } }
    : { $set: { assignedPropertyIds: [] } };

  await realtorModel.findByIdAndUpdate(id, update);

  const updated = await realtorModel
    .findById(id)
    .select("_id assignedPropertyIds")
    .populate("assignedPropertyIds", "productName street city state status slug")
    .lean();

  return res.status(200).json({
    success: true,
    message: propertyId ? "Property removed" : "All properties removed",
    assignedProperties: updated.assignedPropertyIds || []
  });
});


// ============================================================================
// REALTOR DASHBOARD  (mounted under /api/v1/realtor, realtor auth + approved)
// All reads are hard-scoped to req.realtor so Realtor A never sees Realtor B
// (Req 6-10). reservePrice is NEVER returned here.
// ============================================================================

// Map productModel.status (+ auction window) onto the buyer-facing lifecycle:
// Live -> Auction Active -> Auction Closed -> Under Contract -> Closing -> Sold.
// Under Contract / Closing (stages 4-5) have no field in the current schema and
// are only reachable once that data exists; everything else is derived here.
function computeSaleStatus(product) {
  const now = Date.now();
  const start = product.auctionStartDate ? new Date(product.auctionStartDate).getTime() : null;
  const end = product.auctionEndDate ? new Date(product.auctionEndDate).getTime() : null;

  switch (product.status) {
    case "sold":
      return { label: "Sold", stage: 6 };
    case "cancelled":
      return { label: "Cancelled", stage: -1 };
    case "pending":
      return { label: "Coming Soon", stage: 0 };
    case "active":
    default:
      if (start && now < start) return { label: "Live", stage: 1 };
      if (end && now > end) return { label: "Auction Closed", stage: 3 };
      if (start && end && now >= start && now <= end) return { label: "Auction Active", stage: 2 };
      return { label: "Live", stage: 1 };
  }
}

// GET /api/v1/realtor/dashboard/properties   (Req 6, 7, 9)
// The realtor's assigned properties with per-property lead counts (their own
// referred registrations only) and derived sale status.
exports.getMyProperties = catchAsyncError(async (req, res, next) => {
  const realtor = req.realtor;
  const ids = realtor.assignedPropertyIds || [];
  if (!ids.length) return res.status(200).json({ success: true, properties: [] });

  const products = await Product.find({ _id: { $in: ids } })
    .select("productName slug street city state status currentBid startBid auctionStartDate auctionEndDate image")
    .sort({ createdAt: -1 })
    .lean();

  // Lead counts = registrations attributed to THIS realtor only.
  const counts = await AuctionRegistration.aggregate([
    { $match: { auctionId: { $in: products.map((p) => p._id) }, realtorId: realtor._id } },
    { $group: { _id: "$auctionId", count: { $sum: 1 } } }
  ]);
  const countMap = {};
  counts.forEach((c) => { countMap[String(c._id)] = c.count; });

  const properties = products.map((p) => {
    const ss = computeSaleStatus(p);
    return {
      _id: p._id,
      productName: p.productName,
      slug: p.slug || null,
      address: [p.street, p.city, p.state].filter(Boolean).join(", "),
      city: p.city,
      state: p.state,
      image: p.image || null,
      status: p.status,
      saleStatus: ss.label,
      saleStage: ss.stage,
      currentBid: p.currentBid ?? null,
      startBid: p.startBid ?? null,
      auctionStartDate: p.auctionStartDate || null,
      auctionEndDate: p.auctionEndDate || null,
      myLeadsCount: countMap[String(p._id)] || 0
    };
  });

  return res.status(200).json({ success: true, properties });
});

// GET /api/v1/realtor/dashboard/property/:propertyId   (Req 7, 8, 9, 10)
// Full affiliate activity for ONE assigned property: the realtor's referred
// registrations, bids by those referred buyers (read-only), and sale status.
exports.getMyPropertyDetail = catchAsyncError(async (req, res, next) => {
  const realtor = req.realtor;
  const { propertyId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new Errorhandler("Invalid property ID", 400));
  }

  // Isolation: the property must be assigned to THIS realtor.
  const assigned = (realtor.assignedPropertyIds || []).some(
    (id) => String(id) === String(propertyId)
  );
  if (!assigned) {
    return next(new Errorhandler("Property not found or not assigned to you", 403));
  }

  const product = await Product.findById(propertyId).select(
    "productName slug street city county state zipCode propertyType assetType beds " +
    "baths squareFootage lotSize yearBuilt status currentBid startBid minIncrement " +
    "auctionStartDate auctionEndDate image investmentData.valuation.ViharaValue"
  );
  if (!product) return next(new Errorhandler("Property not found", 404));

  const ss = computeSaleStatus(product);

  // Registrations attributed to this realtor for this property.
  const registrations = await AuctionRegistration.find({
    auctionId: propertyId,
    realtorId: realtor._id
  })
    .select("firstName lastName buyerType status submittedAt userId attributedAt")
    .sort({ submittedAt: -1 })
    .lean();

  const myUserIds = registrations.map((r) => r.userId).filter(Boolean);

  // Bids on this property by the realtor's referred buyers ONLY (isolation).
  let bids = [];
  if (myUserIds.length) {
    const raw = await ManualBid.find({ auctionId: propertyId, userId: { $in: myUserIds } })
      .sort({ createdAt: -1 });
    const formatted = await BidsManager.formatBidsWithUserInfo(raw);
    bids = formatted.map((b) => ({
      bidderName: b.bidderName,
      amount: b.amount,
      createdAt: b.createdAt
    }));
  }

  return res.status(200).json({
    success: true,
    property: {
      _id: product._id,
      productName: product.productName,
      slug: product.slug || null,
      location: [product.street, product.city, product.state].filter(Boolean).join(", "),
      address: {
        street: product.street,
        city: product.city,
        county: product.county,
        state: product.state,
        zipCode: product.zipCode
      },
      propertyType: product.propertyType,
      assetType: product.assetType,
      beds: product.beds,
      baths: product.baths,
      squareFootage: product.squareFootage,
      lotSize: product.lotSize,
      yearBuilt: product.yearBuilt,
      image: product.image || null,
      status: product.status,
      saleStatus: ss.label,
      saleStage: ss.stage,
      currentBid: product.currentBid ?? null,
      startBid: product.startBid ?? null,
      minIncrement: product.minIncrement ?? null,
      auctionStartDate: product.auctionStartDate || null,
      auctionEndDate: product.auctionEndDate || null,
      timezone: resolvePropertyTimezone(product),
      viharaValue: product.investmentData?.valuation?.ViharaValue ?? null
    },
    registrations: registrations.map((r) => ({
      id: r._id,
      name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || "Unknown",
      buyerType: r.buyerType || "",
      status: r.status || "pending",
      submittedAt: r.submittedAt,
      attributedAt: r.attributedAt || null
    })),
    bids,
    summary: {
      leads: registrations.length,
      approved: registrations.filter((r) => r.status === "approved").length,
      pending: registrations.filter((r) => r.status === "pending").length,
      bids: bids.length,
      currentBid: product.currentBid ?? null
    }
  });
});


// ============================================================================
// PROPERTY REQUESTS  (Req: realtor can browse ANY property and request it;
// admin approves -> property is assigned to that realtor.)
// ============================================================================

// GET /api/v1/realtor/dashboard/browse?search=   (realtor auth + approved)
// Every property (public-safe fields, no reservePrice) flagged with whether it
// is already assigned to, or already requested by, this realtor.
exports.getRequestableProperties = catchAsyncError(async (req, res, next) => {
  const realtor = req.realtor;
  const { search } = req.query;

  const filter = {};
  if (search && String(search).trim()) {
    const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [
      { productName: rx }, { street: rx }, { city: rx }, { state: rx }, { zipCode: rx }
    ];
  }

  const products = await Product.find(filter)
    .select("productName slug street city state zipCode image beds baths squareFootage status currentBid startBid auctionEndDate")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const assigned = new Set((realtor.assignedPropertyIds || []).map((x) => String(x)));
  const requests = await PropertyRequest.find({ realtorId: realtor._id }).select("propertyId status").lean();
  const reqMap = {};
  requests.forEach((r) => { reqMap[String(r.propertyId)] = r.status; });

  const properties = products.map((p) => ({
    _id: p._id,
    productName: p.productName,
    slug: p.slug || null,
    address: [p.street, p.city, p.state].filter(Boolean).join(", "),
    city: p.city,
    state: p.state,
    image: p.image || null,
    beds: p.beds,
    baths: p.baths,
    squareFootage: p.squareFootage,
    status: p.status,
    currentBid: p.currentBid ?? null,
    isAssigned: assigned.has(String(p._id)),
    requestStatus: reqMap[String(p._id)] || null
  }));

  return res.status(200).json({ success: true, properties });
});

// POST /api/v1/realtor/dashboard/request   body: { propertyId }
exports.createPropertyRequest = catchAsyncError(async (req, res, next) => {
  const realtor = req.realtor;
  const { propertyId } = req.body;

  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return next(new Errorhandler("Valid propertyId is required", 400));
  }

  const product = await Product.findById(propertyId).select("_id productName");
  if (!product) return next(new Errorhandler("Property not found", 404));

  const alreadyAssigned = (realtor.assignedPropertyIds || []).some(
    (id) => String(id) === String(propertyId)
  );
  if (alreadyAssigned) {
    return next(new Errorhandler("This property is already on your showcase", 409));
  }

  let request = await PropertyRequest.findOne({ realtorId: realtor._id, propertyId });
  if (request) {
    if (request.status === "pending") {
      return next(new Errorhandler("You've already requested this property", 409));
    }
    if (request.status === "approved") {
      return next(new Errorhandler("This property is already on your showcase", 409));
    }
    // Declined before -> reopen to pending.
    request.status = "pending";
    request.note = null;
    request.reviewedAt = null;
    await request.save();
  } else {
    request = await PropertyRequest.create({ realtorId: realtor._id, propertyId });
  }

  return res.status(201).json({
    success: true,
    message: "Request submitted",
    request: { _id: request._id, propertyId, status: request.status }
  });
});

// GET /api/v1/realtor/dashboard/requests   (realtor's own requests)
exports.getMyRequests = catchAsyncError(async (req, res, next) => {
  const requests = await PropertyRequest.find({ realtorId: req.realtor._id })
    .populate("propertyId", "productName street city state image status")
    .sort({ createdAt: -1 })
    .lean();

  const shaped = requests.map((r) => ({
    _id: r._id,
    status: r.status,
    note: r.note || null,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt || null,
    property: r.propertyId
      ? {
          _id: r.propertyId._id,
          productName: r.propertyId.productName,
          address: [r.propertyId.street, r.propertyId.city, r.propertyId.state].filter(Boolean).join(", "),
          image: r.propertyId.image || null,
          status: r.propertyId.status
        }
      : null
  }));

  return res.status(200).json({ success: true, requests: shaped });
});

// GET /api/v1/admin/realtor-requests?status=   (admin)
exports.adminGetPropertyRequests = catchAsyncError(async (req, res, next) => {
  const { status } = req.query;
  const filter = {};
  if (status && ["pending", "approved", "declined"].includes(status)) filter.status = status;

  const requests = await PropertyRequest.find(filter)
    .populate("realtorId", "name email slug")
    .populate("propertyId", "productName street city state image")
    .sort({ createdAt: -1 })
    .lean();

  const shaped = requests.map((r) => ({
    _id: r._id,
    status: r.status,
    note: r.note || null,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt || null,
    realtor: r.realtorId
      ? { _id: r.realtorId._id, name: r.realtorId.name, email: r.realtorId.email, slug: r.realtorId.slug }
      : null,
    property: r.propertyId
      ? {
          _id: r.propertyId._id,
          productName: r.propertyId.productName,
          address: [r.propertyId.street, r.propertyId.city, r.propertyId.state].filter(Boolean).join(", "),
          image: r.propertyId.image || null
        }
      : null
  }));

  return res.status(200).json({ success: true, requests: shaped });
});

// PUT /api/v1/admin/realtor-request/:id   body: { action: "approve"|"decline", note? }
exports.adminReviewPropertyRequest = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { action, note } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new Errorhandler("Invalid request ID", 400));
  }
  if (!["approve", "decline"].includes(action)) {
    return next(new Errorhandler("Action must be approve or decline", 400));
  }

  const request = await PropertyRequest.findById(id);
  if (!request) return next(new Errorhandler("Request not found", 404));
  if (request.status !== "pending") {
    return next(new Errorhandler("This request has already been reviewed", 409));
  }

  const realtor = await realtorModel
    .findById(request.realtorId)
    .select("_id name email slug assignedPropertyIds");
  const product = await Product.findById(request.propertyId).select("_id productName street city state");
  if (!realtor || !product) {
    return next(new Errorhandler("Realtor or property no longer exists", 404));
  }

  const propertyAddress = [product.street, product.city, product.state].filter(Boolean).join(", ");
  request.note = note ? String(note).trim() : null;
  request.reviewedAt = new Date();

  if (action === "approve") {
    await realtorModel.findByIdAndUpdate(realtor._id, {
      $addToSet: { assignedPropertyIds: product._id }
    });
    request.status = "approved";
    await request.save();
    try {
      sendEmail(
        realtor.email,
        realtor.name,
        "Your property request was approved",
        createRealtorRequestApprovedEmail(realtor.name, product.productName, propertyAddress, "https://vihara.ai/realtor/dashboard")
      );
    } catch (e) {
      console.error("realtor request-approved email failed:", e);
    }
  } else {
    request.status = "declined";
    await request.save();
    try {
      sendEmail(
        realtor.email,
        realtor.name,
        "Update on your property request",
        createRealtorRequestDeclinedEmail(realtor.name, product.productName, propertyAddress, request.note)
      );
    } catch (e) {
      console.error("realtor request-declined email failed:", e);
    }
  }

  return res.status(200).json({
    success: true,
    message: `Request ${request.status}`,
    request: { _id: request._id, status: request.status, note: request.note }
  });
});


// GET /api/v1/admin/realtor/:id/registrations   (admin)
// Every registration attributed to this realtor's referral, with buyer +
// property details (which referral produced which registration).
exports.adminGetRealtorRegistrations = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new Errorhandler("Invalid realtor ID", 400));
  }

  const registrations = await AuctionRegistration.find({ realtorId: id })
    .populate("auctionId", "productName street city state")
    .populate("userId", "name email")
    .sort({ submittedAt: -1 })
    .lean();

  const shaped = registrations.map((r) => ({
    id: r._id,
    buyerName:
      (r.userId && r.userId.name) ||
      `${r.firstName || ""} ${r.lastName || ""}`.trim() ||
      "Unknown",
    buyerEmail: (r.userId && r.userId.email) || r.email || null,
    buyerType: r.buyerType || "",
    status: r.status || "pending",
    submittedAt: r.submittedAt,
    attributedAt: r.attributedAt || null,
    property: r.auctionId
      ? {
          _id: r.auctionId._id,
          productName: r.auctionId.productName,
          address: [r.auctionId.street, r.auctionId.city, r.auctionId.state].filter(Boolean).join(", ")
        }
      : null
  }));

  return res.status(200).json({ success: true, registrations: shaped });
});
