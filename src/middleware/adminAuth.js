// middleware/adminAuth.js
const jwt = require("jsonwebtoken");
const catchAsyncError = require("./catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const adminModel = require("../model/adminModel");
const userModel = require("../model/userModel");

/**
 * Resolves the logged-in advisor for note actions and sets req.advisor.
 *
 * Your admin login issues a JWT of { id } signed with process.env.secret and
 * stores it in the `token` cookie (same secret/cookie your site auth uses). An
 * advisor may live in the admin collection OR be a user with an elevated role,
 * so we look up whichever collection this token's id belongs to.
 *
 * NOTE: if your admin panel stores its JWT under a different cookie name, change
 * `req.cookies?.token` below to that name.
 */
exports.resolveAdvisor = catchAsyncError(async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return next(new Errorhandler("Please login to access this resource", 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.secret);
  } catch (e) {
    return next(new Errorhandler("Invalid or expired token", 401));
  }

  // Admin first (that's where advisors normally live), then fall back to user.
  let advisor = await adminModel.findById(decoded.id).select("name email");
  if (!advisor) advisor = await userModel.findById(decoded.id).select("name email");
  if (!advisor) return next(new Errorhandler("Not authorized", 401));

  req.advisor = {
    id: advisor._id,
    name: advisor.name || advisor.email || "Advisor",
  };
  next();
});
