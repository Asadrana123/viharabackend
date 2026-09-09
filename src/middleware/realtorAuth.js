// middleware/realtorAuth.js
const jwt = require("jsonwebtoken");
const catchAsyncError = require("./catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const realtorModel = require("../model/realtorModel");

/**
 * Realtor session auth.
 *
 * Realtors are a SEPARATE account type from buyers/admins and use their own
 * cookie: `realtorToken` (JWT { id, kind:'realtor' } signed with the same
 * process.env.secret). A distinct cookie means a realtor login never clobbers
 * a buyer's `token` session in the same browser.
 *
 * isRealtorAuthenticated -> verifies the token and loads req.realtor.
 * requireApprovedRealtor -> gate for dashboard routes; only 'approved'
 *                           realtors pass. Use it AFTER isRealtorAuthenticated.
 */
exports.isRealtorAuthenticated = catchAsyncError(async (req, res, next) => {
    const token = req.cookies?.realtorToken;
    if (!token) {
        return next(new Errorhandler("Please login to access this resource", 401));
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.secret);
    } catch (error) {
        return next(new Errorhandler("Invalid or expired token", 401));
    }

    if (decoded.kind !== "realtor") {
        return next(new Errorhandler("Invalid or expired token", 401));
    }

    req.realtor = await realtorModel.findById(decoded.id);
    if (!req.realtor) {
        return next(new Errorhandler("Realtor account not found", 404));
    }

    next();
});

exports.requireApprovedRealtor = (req, res, next) => {
    if (!req.realtor) {
        return next(new Errorhandler("Realtor not authenticated", 401));
    }

    if (req.realtor.status !== "approved") {
        const messages = {
            pending: "Your realtor account is pending admin approval",
            rejected: "Your realtor application was not approved",
            suspended: "Your realtor account has been suspended"
        };
        return next(
            new Errorhandler(messages[req.realtor.status] || "Access denied", 403)
        );
    }

    next();
};
