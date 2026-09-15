const mongoose = require("mongoose");

// ============================================================================
// PROPERTY SUBMISSION  (Realtor Property Upload & Management Workflow)
// ----------------------------------------------------------------------------
// A realtor's self-uploaded property listing, held in a STAGING collection that
// is deliberately separate from productModel. Realtors only ever collect a few
// basic details + images here; the auction business terms (emd, commission,
// eventID, trusteeSaleNumber, minIncrement …) are NOT part of a submission and
// are filled by an admin at approval time, when the real productModel document
// is created.
//
// Why a separate model (not fields on productModel):
//   - productModel has many `required: true` business fields a realtor cannot
//     provide, so a half-filled draft could never be saved there.
//   - Unapproved realtor content never touches the live product collection, so
//     public/auction queries (showOnAuctions) stay clean with no extra guards.
//
// Lifecycle (reviewStatus):
//   draft ──submit──▶ pending_review ──▶ approved  (admin publishes → product)
//                          │                └─────▶ (publishedProductId set)
//                          ├──▶ changes_requested ──resubmit──▶ pending_review
//                          └──▶ rejected
// Only the realtor who owns a submission may read/edit it (enforced in the
// controller, hard-scoped to req.realtor). Admin reads/reviews all of them.
// ============================================================================

// Enum values are copied verbatim from productModel so a submission maps 1:1
// onto a product at approval time with no translation.
const PROPERTY_TYPES = ["Single Family", "Condo, Townhouse, other single unit", "Multi-family", "Land"];
const OCCUPANCY_STATUSES = ["Vacant", "Occupied", "Reported Vacant"];
const ASSET_TYPES = ["Reo Bank Owned", "Foreclosure Homes", "Short Sale"];

const REVIEW_STATUSES = ["draft", "pending_review", "changes_requested", "approved", "rejected"];

const propertySubmissionSchema = new mongoose.Schema({
    // ========================================================================
    // OWNERSHIP — which realtor submitted this. Every read/write is scoped to
    // this id so Realtor A can never see or edit Realtor B's submission.
    // ========================================================================
    realtorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "realtorModel",
        required: true,
        index: true
    },

    // ========================================================================
    // BASIC PROPERTY DETAILS  (realtor-entered — workflow steps 2 & 3)
    // Nothing here is schema-required, so a Draft saves even when mostly empty.
    // The "required to submit" check lives in the controller (on submit only).
    // ========================================================================
    productName: { type: String, trim: true, default: "" },        // "Property Title"
    propertyDescription: { type: String, default: "" },

    // Address
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    county: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    zipCode: { type: String, trim: true, default: "" },

    // Characteristics
    propertyType: {
        type: String,
        enum: { values: PROPERTY_TYPES, message: "Invalid property type" },
        default: null
    },
    assetType: {
        type: String,
        enum: { values: ASSET_TYPES, message: "Invalid asset type" },
        default: null
    },
    occupancyStatus: {
        type: String,
        enum: { values: OCCUPANCY_STATUSES, message: "Invalid occupancy status" },
        default: null
    },
    beds: { type: Number, default: null },
    baths: { type: Number, default: null },
    squareFootage: { type: Number, default: null },
    lotSize: { type: Number, default: null },
    yearBuilt: { type: Number, default: null },
    monthlyHOADues: { type: Number, default: null },

    // ========================================================================
    // IMAGES  (realtor-uploaded — workflow step 3)
    // The realtor's browser uploads to Cloudinary and sends the secure_url
    // strings; only the first image is the main/cover image, the rest are
    // otherImages — mirrors productModel's image / otherImages split.
    // ========================================================================
    image: { type: String, default: "" },
    otherImages: [{ type: String }],

    // ========================================================================
    // OPTIONAL PRICING / AUCTION DETAILS  (realtor-entered — workflow step 4)
    // Every field here is optional. If a realtor leaves them blank the admin
    // sets the real auction terms at approval. Stored as-entered; never used to
    // drive a live auction until an admin publishes the product.
    // ========================================================================
    startingBid: { type: Number, default: null },
    reservePrice: { type: Number, default: null },
    buyNowPrice: { type: Number, default: null },
    auctionStartDate: { type: Date, default: null },
    auctionEndDate: { type: Date, default: null },

    // ========================================================================
    // REVIEW WORKFLOW  (steps 5, 6, 7, 11)
    // ========================================================================
    reviewStatus: {
        type: String,
        enum: REVIEW_STATUSES,
        default: "draft",
        index: true
    },
    // Admin's note to the realtor when requesting changes or rejecting. Shown
    // back to the realtor on their submission so they know what to fix.
    reviewNote: {
        type: String,
        default: null
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userModel",           // admin is a userModel with role 'admin'
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    // Stamped the moment the realtor submits for review (first time and on each
    // resubmit). null while still a draft.
    submittedAt: {
        type: Date,
        default: null
    },

    // ========================================================================
    // PUBLISH LINK  (step 7 — property goes live)
    // Set once, when an admin approves and the live productModel is created from
    // this submission. Ties the staged submission to the published property so
    // the realtor dashboard and future edits can find one from the other.
    // ========================================================================
    publishedProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "productModel",
        default: null,
        index: true
    },

    // ========================================================================
    // TIMESTAMPS
    // ========================================================================
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Realtor dashboard lists "my submissions" newest-first, filtered by status.
propertySubmissionSchema.index({ realtorId: 1, reviewStatus: 1, createdAt: -1 });

propertySubmissionSchema.pre("save", function (next) {
    this.updatedAt = Date.now();
    next();
});

// Exposed so the controller and admin panel share ONE source of truth for the
// allowed values instead of re-declaring them.
propertySubmissionSchema.statics.PROPERTY_TYPES = PROPERTY_TYPES;
propertySubmissionSchema.statics.OCCUPANCY_STATUSES = OCCUPANCY_STATUSES;
propertySubmissionSchema.statics.ASSET_TYPES = ASSET_TYPES;
propertySubmissionSchema.statics.REVIEW_STATUSES = REVIEW_STATUSES;

module.exports = mongoose.model("propertySubmissionModel", propertySubmissionSchema);
