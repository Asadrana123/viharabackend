// controller/propertySubmissionController.js
//
// Realtor Property Upload & Management Workflow.
//
// Realtors self-upload property listings that live in a STAGING collection
// (propertySubmissionModel), go through admin review, and — only on approval —
// become a real productModel that is published and assigned to the realtor.
//
// This file holds BOTH sides of the workflow:
//   • REALTOR-FACING  (mounted under /api/v1/realtor, realtor auth + approved)
//       create draft, edit draft, submit for review, resubmit, list mine,
//       get one, delete a draft.
//   • ADMIN-FACING    (mounted under /api/v1/admin, admin auth)
//       list submissions, get one, approve (→ publish product), request
//       changes, reject.
//
// Every realtor read/write is hard-scoped to req.realtor so Realtor A can never
// see or touch Realtor B's submissions. Auction business terms (emd, commission,
// eventID, trusteeSaleNumber, minIncrement …) are NOT collected from realtors —
// the admin supplies/defaults them at approval when the product is created.

const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const PropertySubmission = require("../model/propertySubmissionModel");
const Product = require("../model/productModel");
const realtorModel = require("../model/realtorModel");
const sendEmail = require("../utils/sendEmail");
const { notifyNewLead } = require("../services/slackService");

const createRealtorSubmissionReceivedEmail = require("../htmlPages/realtorSubmissionReceivedEmail");
const createRealtorSubmissionApprovedEmail = require("../htmlPages/realtorSubmissionApprovedEmail");
const createRealtorSubmissionChangesRequestedEmail = require("../htmlPages/realtorSubmissionChangesRequestedEmail");
const createRealtorSubmissionRejectedEmail = require("../htmlPages/realtorSubmissionRejectedEmail");

// Public site origin used to build realtor-facing links.
const FRONTEND_URL = "https://vihara.ai";

// Fields a realtor may set on create/update. Auction money-terms are absent by
// design — the admin fills those at approval. Anything not in this list is
// ignored (status, publishedProductId, timestamps can never be client-set).
const EDITABLE_FIELDS = [
    "productName", "propertyDescription",
    "street", "city", "county", "state", "zipCode",
    "propertyType", "assetType", "occupancyStatus",
    "beds", "baths", "squareFootage", "lotSize", "yearBuilt", "monthlyHOADues",
    "image", "otherImages",
    "startingBid", "reservePrice", "buyNowPrice", "auctionStartDate", "auctionEndDate"
];

const STRING_FIELDS = new Set([
    "productName", "propertyDescription", "street", "city", "county", "state",
    "zipCode", "propertyType", "assetType", "occupancyStatus"
]);
const NUMBER_FIELDS = new Set([
    "beds", "baths", "squareFootage", "lotSize", "yearBuilt", "monthlyHOADues",
    "startingBid", "reservePrice", "buyNowPrice"
]);
const DATE_FIELDS = new Set(["auctionStartDate", "auctionEndDate"]);

// The minimum a realtor must provide before a draft can be SUBMITTED for review.
// (Drafts save with none of this filled — the check runs only on submit.)
// Auction terms + apn/yearBuilt/HOA are intentionally NOT here; the admin
// completes those at approval.
const REQUIRED_TO_SUBMIT = [
    "productName", "propertyDescription",
    "street", "city", "county", "state", "zipCode",
    "propertyType", "beds", "baths", "squareFootage", "lotSize"
];

// reviewStatus → friendly label surfaced to the realtor UI ("My Properties").
const STATUS_LABELS = {
    draft: "Draft",
    pending_review: "Pending Review",
    changes_requested: "Changes Requested",
    approved: "Live",
    rejected: "Rejected"
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Copy only whitelisted, type-coerced fields from a request body onto a doc.
function applyEditableFields(doc, body = {}) {
    EDITABLE_FIELDS.forEach((key) => {
        if (body[key] === undefined) return;
        const raw = body[key];

        if (key === "otherImages") {
            doc.otherImages = Array.isArray(raw)
                ? raw.filter((u) => typeof u === "string" && u.trim())
                : [];
            return;
        }
        if (STRING_FIELDS.has(key)) {
            doc[key] = raw === null ? (key === "propertyType" || key === "assetType" || key === "occupancyStatus" ? null : "") : String(raw).trim();
            return;
        }
        if (NUMBER_FIELDS.has(key)) {
            doc[key] = raw === null || raw === "" ? null : Number(raw);
            return;
        }
        if (DATE_FIELDS.has(key)) {
            doc[key] = raw ? new Date(raw) : null;
            return;
        }
        if (key === "image") {
            doc.image = raw ? String(raw).trim() : "";
        }
    });
}

// Which REQUIRED_TO_SUBMIT fields are still blank, + whether any image exists.
function missingForSubmit(sub) {
    const blanks = REQUIRED_TO_SUBMIT.filter((f) => {
        const v = sub[f];
        return v === null || v === undefined || v === "";
    });
    const hasImage = Boolean(sub.image) || (Array.isArray(sub.otherImages) && sub.otherImages.length > 0);
    if (!hasImage) blanks.push("at least one image");
    return blanks;
}

// Full shape for the realtor's own view (edit form + status).
function realtorSubmissionShape(s) {
    return {
        _id: s._id,
        reviewStatus: s.reviewStatus,
        statusLabel: STATUS_LABELS[s.reviewStatus] || s.reviewStatus,
        reviewNote: s.reviewNote || null,
        submittedAt: s.submittedAt || null,
        reviewedAt: s.reviewedAt || null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        publishedProductId: s.publishedProductId || null,

        productName: s.productName || "",
        propertyDescription: s.propertyDescription || "",
        street: s.street || "",
        city: s.city || "",
        county: s.county || "",
        state: s.state || "",
        zipCode: s.zipCode || "",
        address: [s.street, s.city, s.state].filter(Boolean).join(", "),
        propertyType: s.propertyType || null,
        assetType: s.assetType || null,
        occupancyStatus: s.occupancyStatus || null,
        beds: s.beds ?? null,
        baths: s.baths ?? null,
        squareFootage: s.squareFootage ?? null,
        lotSize: s.lotSize ?? null,
        yearBuilt: s.yearBuilt ?? null,
        monthlyHOADues: s.monthlyHOADues ?? null,
        image: s.image || "",
        otherImages: Array.isArray(s.otherImages) ? s.otherImages : [],
        startingBid: s.startingBid ?? null,
        reservePrice: s.reservePrice ?? null,
        buyNowPrice: s.buyNowPrice ?? null,
        auctionStartDate: s.auctionStartDate || null,
        auctionEndDate: s.auctionEndDate || null
    };
}

// Compact shape for list rows (realtor "My Properties" + admin queue).
function submissionListShape(s) {
    return {
        _id: s._id,
        productName: s.productName || "Untitled property",
        address: [s.street, s.city, s.state].filter(Boolean).join(", "),
        city: s.city || "",
        state: s.state || "",
        image: s.image || (Array.isArray(s.otherImages) ? s.otherImages[0] : null) || null,
        propertyType: s.propertyType || null,
        beds: s.beds ?? null,
        baths: s.baths ?? null,
        reviewStatus: s.reviewStatus,
        statusLabel: STATUS_LABELS[s.reviewStatus] || s.reviewStatus,
        reviewNote: s.reviewNote || null,
        submittedAt: s.submittedAt || null,
        createdAt: s.createdAt,
        publishedProductId: s.publishedProductId || null
    };
}

// Coerce a possibly-undefined value to a number, else a default.
const numOr = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));

// ============================================================================
// REALTOR-FACING  (mounted under /api/v1/realtor/dashboard/submissions)
// ============================================================================

// POST /api/v1/realtor/dashboard/submissions
// Create a new DRAFT. Saves whatever is provided (nothing required yet).
exports.createSubmission = catchAsyncError(async (req, res, next) => {
    const submission = new PropertySubmission({ realtorId: req.realtor._id });
    applyEditableFields(submission, req.body);
    submission.reviewStatus = "draft";

    await submission.save();
    return res.status(201).json({
        success: true,
        message: "Draft saved",
        submission: realtorSubmissionShape(submission)
    });
});

// PUT /api/v1/realtor/dashboard/submissions/:id
// Edit a submission. Allowed only while it is the realtor's to edit:
// draft or changes_requested. (pending / approved / rejected are locked.)
exports.updateSubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findOne({ _id: id, realtorId: req.realtor._id });
    if (!submission) return next(new Errorhandler("Submission not found", 404));

    if (!["draft", "changes_requested"].includes(submission.reviewStatus)) {
        return next(new Errorhandler("This submission can no longer be edited", 409));
    }

    applyEditableFields(submission, req.body);
    await submission.save();

    return res.status(200).json({
        success: true,
        message: "Changes saved",
        submission: realtorSubmissionShape(submission)
    });
});

// POST /api/v1/realtor/dashboard/submissions/:id/submit
// Submit a draft (or resubmit after changes were requested) for admin review.
// Validates the required basics, flips to pending_review, notifies admin.
exports.submitSubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findOne({ _id: id, realtorId: req.realtor._id });
    if (!submission) return next(new Errorhandler("Submission not found", 404));

    if (!["draft", "changes_requested"].includes(submission.reviewStatus)) {
        return next(new Errorhandler("This submission has already been submitted", 409));
    }

    // Allow last-moment edits to be sent together with the submit call.
    if (req.body && Object.keys(req.body).length) {
        applyEditableFields(submission, req.body);
    }

    const missing = missingForSubmit(submission);
    if (missing.length) {
        return next(new Errorhandler(`Please complete: ${missing.join(", ")}`, 400));
    }

    const isResubmit = submission.reviewStatus === "changes_requested";
    submission.reviewStatus = "pending_review";
    submission.submittedAt = new Date();
    submission.reviewNote = null;   // clear old feedback — this is a fresh review
    submission.reviewedAt = null;
    submission.reviewedBy = null;
    await submission.save();

    const realtor = req.realtor;
    const propertyAddress = [submission.street, submission.city, submission.state].filter(Boolean).join(", ");

    // Confirmation to the realtor (fire-and-forget).
    try {
        sendEmail(
            realtor.email,
            realtor.name,
            "We received your property submission",
            createRealtorSubmissionReceivedEmail(realtor.name, submission.productName, propertyAddress)
        );
    } catch (e) {
        console.error("submission received email failed:", e);
    }

    // Nudge the team that a submission is waiting for review (fire-and-forget).
    notifyNewLead({
        leadType: isResubmit ? "Property Re-submission" : "Property Submission",
        name: realtor.name,
        email: realtor.email,
        phone: realtor.phone,
        source: "realtor-property-submission",
        webhookUrl: process.env.SLACK_REALTOR_WEBHOOK_URL,
        extraFields: [
            { label: "Property", value: submission.productName || "Untitled" },
            { label: "Address", value: propertyAddress },
        ],
    }).catch((e) => console.error("[slack] submission notify failed:", e.message));

    return res.status(200).json({
        success: true,
        message: "Submitted for review",
        submission: realtorSubmissionShape(submission)
    });
});

// GET /api/v1/realtor/dashboard/submissions?status=
// The realtor's own submissions, newest first, optionally filtered by status.
exports.listMySubmissions = catchAsyncError(async (req, res, next) => {
    const { status } = req.query;
    const filter = { realtorId: req.realtor._id };
    if (status && PropertySubmission.REVIEW_STATUSES.includes(status)) {
        filter.reviewStatus = status;
    }

    const submissions = await PropertySubmission.find(filter)
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json({
        success: true,
        submissions: submissions.map(submissionListShape)
    });
});

// GET /api/v1/realtor/dashboard/submissions/:id
exports.getMySubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findOne({ _id: id, realtorId: req.realtor._id }).lean();
    if (!submission) return next(new Errorhandler("Submission not found", 404));

    return res.status(200).json({ success: true, submission: realtorSubmissionShape(submission) });
});

// DELETE /api/v1/realtor/dashboard/submissions/:id
// A realtor can discard a submission that is NOT in flight or already live:
// draft, changes_requested, or rejected. pending_review / approved are locked.
exports.deleteSubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findOne({ _id: id, realtorId: req.realtor._id });
    if (!submission) return next(new Errorhandler("Submission not found", 404));

    if (!["draft", "changes_requested", "rejected"].includes(submission.reviewStatus)) {
        return next(new Errorhandler("This submission can't be deleted", 409));
    }

    await submission.deleteOne();
    return res.status(200).json({ success: true, message: "Submission deleted" });
});

// ============================================================================
// ADMIN-FACING  (mounted under /api/v1/admin; guarded by admin auth in routes)
// ============================================================================

// GET /api/v1/admin/property-submissions?status=&realtorId=
exports.adminListSubmissions = catchAsyncError(async (req, res, next) => {
    const { status, realtorId } = req.query;
    const filter = {};
    if (status && PropertySubmission.REVIEW_STATUSES.includes(status)) filter.reviewStatus = status;
    if (realtorId && mongoose.Types.ObjectId.isValid(realtorId)) filter.realtorId = realtorId;

    const submissions = await PropertySubmission.find(filter)
        .populate("realtorId", "name email slug company")
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean();

    const shaped = submissions.map((s) => ({
        ...submissionListShape(s),
        realtor: s.realtorId
            ? { _id: s.realtorId._id, name: s.realtorId.name, email: s.realtorId.email, slug: s.realtorId.slug, company: s.realtorId.company || null }
            : null
    }));

    return res.status(200).json({ success: true, submissions: shaped });
});

// GET /api/v1/admin/property-submission/:id  — full detail for the review screen.
exports.adminGetSubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findById(id)
        .populate("realtorId", "name email phone company licenseNumber image slug")
        .lean();
    if (!submission) return next(new Errorhandler("Submission not found", 404));

    return res.status(200).json({
        success: true,
        submission: {
            ...realtorSubmissionShape(submission),
            realtor: submission.realtorId
                ? {
                    _id: submission.realtorId._id,
                    name: submission.realtorId.name,
                    email: submission.realtorId.email,
                    phone: submission.realtorId.phone || null,
                    company: submission.realtorId.company || null,
                    licenseNumber: submission.realtorId.licenseNumber || null,
                    image: submission.realtorId.image || null,
                    slug: submission.realtorId.slug || null
                }
                : null
        }
    });
});

// PUT /api/v1/admin/property-submission/:id/approve
// Publish: create a real productModel from the submission + admin-supplied
// auction terms, assign it to the realtor, mark the submission approved and
// link it to the new product. Body may carry any productModel field to
// override/complete (emd, commission, minIncrement, eventID, dates …).
exports.adminApproveSubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    const b = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findById(id);
    if (!submission) return next(new Errorhandler("Submission not found", 404));
    if (submission.reviewStatus === "approved") {
        return next(new Errorhandler("This submission is already published", 409));
    }
    if (submission.reviewStatus !== "pending_review") {
        return next(new Errorhandler("Only a submission that is pending review can be approved", 409));
    }

    const realtor = await realtorModel
        .findById(submission.realtorId)
        .select("_id name email phone company licenseNumber image assignedPropertyIds");
    if (!realtor) return next(new Errorhandler("The submitting realtor no longer exists", 404));

    // Build the product: realtor basics + admin-supplied/defaulted auction terms.
    // Defaults mirror the property importer so productModel's required fields
    // are always satisfied; the admin can override any of them via the body.
    const startBid = numOr(b.startBid ?? submission.startingBid ?? submission.reservePrice, 0);
    const productPayload = {
        productName: submission.productName,
        propertyDescription: submission.propertyDescription,
        propertyType: submission.propertyType,

        street: submission.street,
        city: submission.city,
        county: submission.county,
        state: submission.state,
        zipCode: submission.zipCode,

        beds: numOr(b.beds ?? submission.beds, 0),
        baths: numOr(b.baths ?? submission.baths, 0),
        squareFootage: numOr(b.squareFootage ?? submission.squareFootage, 0),
        lotSize: numOr(b.lotSize ?? submission.lotSize, 0),
        yearBuilt: numOr(b.yearBuilt ?? submission.yearBuilt, 0),
        monthlyHOADues: numOr(b.monthlyHOADues ?? submission.monthlyHOADues, 0),
        apn: (b.apn && String(b.apn).trim()) || "TBD",

        // Auction business terms — admin-provided or safe defaults.
        reservePrice: numOr(b.reservePrice ?? submission.reservePrice, 0),
        startBid,
        minIncrement: numOr(b.minIncrement, 1000),
        emd: numOr(b.emd, 0),
        commission: numOr(b.commission, 0),
        eventID: (b.eventID && String(b.eventID).trim()) || "TBD",
        trusteeSaleNumber: (b.trusteeSaleNumber && String(b.trusteeSaleNumber).trim()) || "TBD",
        onlineOrInPerson: b.onlineOrInPerson === "In Person" ? "In Person" : "Online",
        auctionStartDate: b.auctionStartDate ?? submission.auctionStartDate ?? null,
        auctionEndDate: b.auctionEndDate ?? submission.auctionEndDate ?? null,

        image: submission.image || "",
        otherImages: Array.isArray(submission.otherImages) ? submission.otherImages : [],

        // Listing shows "By <realtor>" — populate the listingAgent from the realtor.
        listingAgent: {
            name: realtor.name,
            company: realtor.company || "",
            phone: realtor.phone || "",
            email: realtor.email || "",
            licenseNumber: realtor.licenseNumber || "",
            image: realtor.image || ""
        },

        // Goes live on the main listing + the realtor's showcase.
        showOnAuctions: b.showOnAuctions === false ? false : true,
        status: "active"
    };

    // Optional enums only if present (they're optional on productModel).
    if (submission.assetType) productPayload.assetType = submission.assetType;
    if (submission.occupancyStatus) productPayload.occupancyStatus = submission.occupancyStatus;

    // .create() runs the pre-save hook (slug generation) just like /bulk.
    let product;
    try {
        product = await Product.create(productPayload);
    } catch (err) {
        return next(new Errorhandler(`Could not publish property: ${err.message}`, 400));
    }

    // Assign to the realtor's showcase/dashboard (idempotent).
    await realtorModel.findByIdAndUpdate(realtor._id, {
        $addToSet: { assignedPropertyIds: product._id }
    });

    // Mark the submission approved + linked to the live product.
    submission.reviewStatus = "approved";
    submission.reviewNote = b.note ? String(b.note).trim() : null;
    submission.reviewedBy = req.user?._id || null;
    submission.reviewedAt = new Date();
    submission.publishedProductId = product._id;
    await submission.save();

    const propertyAddress = [product.street, product.city, product.state].filter(Boolean).join(", ");
    const listingUrl = product.slug ? `${FRONTEND_URL}/listing/${product.slug}` : `${FRONTEND_URL}/auctions`;

    try {
        sendEmail(
            realtor.email,
            realtor.name,
            "Your property is now live on Vihara",
            createRealtorSubmissionApprovedEmail(
                realtor.name,
                product.productName,
                propertyAddress,
                `${FRONTEND_URL}/realtor/dashboard`,
                listingUrl
            )
        );
    } catch (e) {
        console.error("submission approved email failed:", e);
    }

    return res.status(200).json({
        success: true,
        message: "Property published",
        product: { _id: product._id, slug: product.slug || null, productName: product.productName },
        submission: { _id: submission._id, reviewStatus: submission.reviewStatus, publishedProductId: submission.publishedProductId }
    });
});

// PUT /api/v1/admin/property-submission/:id/request-changes   body: { note }
// Bounce it back to the realtor with a note (step 6 "Request Changes").
exports.adminRequestChanges = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    const { note } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }
    if (!note || !String(note).trim()) {
        return next(new Errorhandler("Please include a note describing the changes needed", 400));
    }

    const submission = await PropertySubmission.findById(id);
    if (!submission) return next(new Errorhandler("Submission not found", 404));
    if (submission.reviewStatus !== "pending_review") {
        return next(new Errorhandler("Only a submission that is pending review can be sent back", 409));
    }

    submission.reviewStatus = "changes_requested";
    submission.reviewNote = String(note).trim();
    submission.reviewedBy = req.user?._id || null;
    submission.reviewedAt = new Date();
    await submission.save();

    const realtor = await realtorModel.findById(submission.realtorId).select("name email");
    if (realtor) {
        const propertyAddress = [submission.street, submission.city, submission.state].filter(Boolean).join(", ");
        try {
            sendEmail(
                realtor.email,
                realtor.name,
                "Changes requested on your property submission",
                createRealtorSubmissionChangesRequestedEmail(
                    realtor.name,
                    submission.productName,
                    propertyAddress,
                    submission.reviewNote,
                    `${FRONTEND_URL}/realtor/dashboard`
                )
            );
        } catch (e) {
            console.error("submission changes email failed:", e);
        }
    }

    return res.status(200).json({
        success: true,
        message: "Changes requested",
        submission: { _id: submission._id, reviewStatus: submission.reviewStatus, reviewNote: submission.reviewNote }
    });
});

// PUT /api/v1/admin/property-submission/:id/reject   body: { note? }
exports.adminRejectSubmission = catchAsyncError(async (req, res, next) => {
    const { id } = req.params;
    const { note } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new Errorhandler("Invalid submission ID", 400));
    }

    const submission = await PropertySubmission.findById(id);
    if (!submission) return next(new Errorhandler("Submission not found", 404));
    if (!["pending_review", "changes_requested"].includes(submission.reviewStatus)) {
        return next(new Errorhandler("This submission can't be rejected in its current state", 409));
    }

    submission.reviewStatus = "rejected";
    submission.reviewNote = note ? String(note).trim() : null;
    submission.reviewedBy = req.user?._id || null;
    submission.reviewedAt = new Date();
    await submission.save();

    const realtor = await realtorModel.findById(submission.realtorId).select("name email");
    if (realtor) {
        const propertyAddress = [submission.street, submission.city, submission.state].filter(Boolean).join(", ");
        try {
            sendEmail(
                realtor.email,
                realtor.name,
                "Update on your property submission",
                createRealtorSubmissionRejectedEmail(
                    realtor.name,
                    submission.productName,
                    propertyAddress,
                    submission.reviewNote
                )
            );
        } catch (e) {
            console.error("submission rejected email failed:", e);
        }
    }

    return res.status(200).json({
        success: true,
        message: "Submission rejected",
        submission: { _id: submission._id, reviewStatus: submission.reviewStatus, reviewNote: submission.reviewNote }
    });
});
