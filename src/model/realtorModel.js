const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function slugify(str) {
    return String(str || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

const realtorSchema = new mongoose.Schema({
    // ============================================
    // ACCOUNT / AUTH  (Req 1 — separate realtor account)
    // ============================================
    name: {
        type: String,
        required: [true, "Please enter realtor name"],
        maxLength: [60, "Name cannot exceed 60 characters"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Please enter realtor email"],
        unique: true,
        lowercase: true,
        trim: true,
        validate: [validator.isEmail, "Please enter a valid email"]
    },
    password: {
        type: String,
        required: [true, "Please enter a password"],
        minLength: [8, "Password should have at least 8 characters"],
        select: false
    },

    // ============================================
    // PUBLIC SHOWCASE PROFILE  (Req 3 — profile + contact info)
    // Rendered on www.vihara.ai/:slug
    // ============================================
    phone: {
        type: String,
        default: null,
        trim: true
    },
    company: {
        type: String,
        default: null,
        trim: true
    },
    licenseNumber: {
        type: String,
        default: null,
        trim: true
    },
    image: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        default: null
    },

    // ============================================
    // SHOWCASE SLUG  (Req 2)  ->  /:slug   e.g. /ujjawal
    // Auto-generated from name when missing; unique + stable once set,
    // so showcase URLs never change. Admin may override from Manage Realtors.
    // (Mirrors the slug pattern already used on productModel.)
    // ============================================
    slug: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
        index: true
    },

    // ============================================
    // ACCOUNT LIFECYCLE  (Req 1, Req 5, Req 11)
    // Realtor self-applies -> 'pending'; admin approves / rejects / suspends.
    // Only 'approved' realtors get a live showcase + dashboard access
    // (enforced by requireApprovedRealtor in middleware/realtorAuth.js).
    // ============================================
    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "suspended"],
        default: "pending"
    },
    // Optional admin note recorded when rejecting/suspending.
    statusNote: {
        type: String,
        default: null
    },

    // ============================================
    // ASSIGNED PROPERTIES  (Req 3, Req 11)
    // Only these products appear on the realtor's showcase and dashboard.
    // Admin assigns/removes from Manage Realtors.
    // ============================================
    assignedPropertyIds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "productModel"
        }
    ],

    // ============================================
    // REFERRAL EVENTS  (Brevo handoff — property_shared)
    // Set once, the first time this realtor shares any property link. Drives
    // the Brevo FIRST_PROPERTY_SHARED_AT contact attribute (never overwritten
    // after the first share).
    // ============================================
    firstPropertySharedAt: {
        type: Date,
        default: null
    },

    // ============================================
    // PASSWORD RESET
    // ============================================
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // ============================================
    // TIMESTAMPS
    // ============================================
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Refresh updatedAt, generate a stable unique slug when missing, hash password.
realtorSchema.pre("save", async function (next) {
    this.updatedAt = Date.now();

    // Generate a stable, unique slug only when it's missing.
    if (!this.slug) {
        const base = slugify(this.name) || "realtor";
        let candidate = base;
        let counter = 2;
        while (await this.constructor.findOne({ slug: candidate, _id: { $ne: this._id } })) {
            candidate = `${base}-${counter++}`;
        }
        this.slug = candidate;
    }

    // Only hash the password when it has actually changed.
    if (!this.isModified("password")) {
        return next();
    }
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

realtorSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

realtorSchema.methods.getJWTToken = function () {
    return jwt.sign(
        { id: this._id, kind: "realtor" },
        process.env.secret,
        { expiresIn: process.env.expireTime }
    );
};

realtorSchema.methods.getResetPasswordToken = function () {
    const resetToken = require("crypto").randomBytes(20).toString("hex");
    this.resetPasswordToken = require("crypto")
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
    this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    return resetToken;
};

module.exports = mongoose.model("realtorModel", realtorSchema);
