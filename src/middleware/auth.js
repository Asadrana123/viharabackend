const catchAsyncError = require("./catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const userModel = require("../model/userModel");
const adminModel = require("../model/adminModel");
const jwt = require("jsonwebtoken");

exports.isAuthenticated = catchAsyncError(async (req, res, next) => {
  // Only accept token from cookies
  const token = req.cookies?.token;
  if (!token) {
    return next(new Errorhandler("Please login to access this resource", 401));
  }

  try {
    // Verify token
    const decodedData = jwt.verify(token, process.env.secret);

    // Fetch user
    req.user = await userModel.findById(decodedData.id);

    if (!req.user) {
      return next(new Errorhandler("User not found", 404));
    }

    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return next(new Errorhandler("Invalid or expired token", 401));
  }
});


// Middleware to check if the user has the required role
exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Check if user exists
    if (!req.user) {
      return next(new Errorhandler("User not authenticated", 401));
    }

    // If role isn't specified, default to 'user'
    const userRole = req.user.role || 'user';

    // Check if user's role is included in the allowed roles
    if (!roles.includes(userRole)) {
      return next(
        new Errorhandler(`Role: ${userRole} is not allowed to access this resource`, 403)
      );
    }

    next();
  };
};