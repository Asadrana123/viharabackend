const catchAsyncError = require("../middleware/catchAsyncError");
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
  }

  // If no token found
  if (!token) {
    return next(new Errorhandler("Please login to access this resource", 401));
  }

  try {
    // Verify token
    console.log(process.env.secret)
    console.log(token)
    const decodedData = jwt.verify(token, process.env.secret);
    // Fetch user from database
    req.user = await userModel.findById(decodedData.id);
    
    // Check if user exists
    if (!req.user) {
      return next(new Errorhandler("User not found", 404));
    }
    
    next();
  } catch (error) {
    console.log(error);
    return next(new Errorhandler("Invalid or expired token", 401));
  }
});

exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Check if user exists and has a role property
    if (!req.user || !req.user.role) {
      return next(
        new Errorhandler(`Role property not found on user`, 403)
      );
    }

    // Check if user's role is included in the allowed roles
    if (!roles.includes(req.user.role)) {
      return next(
        new Errorhandler(`Role: ${req.user.role} is not allowed to access this resource`, 403)
      );
    }

    next();
  };
};