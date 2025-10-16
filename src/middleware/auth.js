const catchAsyncError = require("./catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const userModel = require("../model/userModel");
const jwt = require("jsonwebtoken");

exports.isAuthenticated = catchAsyncError(async (req, res, next) => {
  let token;
  
  // Check for token in multiple places
  if (
    req.headers.authorization && 
    req.headers.authorization.startsWith("Bearer")
  ) {
    // Token from Authorization header
    token = req.headers.authorization.split(" ")[1];
  } else if (req.body.token) {
    // Token from request body
    token = req.body.token;
  } else if (req.query.token) {
    // Token from query params
    token = req.query.token;
  } else if (req.cookies && req.cookies.token) {
    // Token from cookies
    token = req.cookies.token;
  }

  // If no token found
  if (!token) {
    return next(new Errorhandler("Please login to access this resource", 401));
  }

  try {
    // Verify token
    const decodedData = jwt.verify(token, process.env.secret);
    
    // Fetch user from database
    req.user = await userModel.findById(decodedData.id);
    
    // Check if user exists
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