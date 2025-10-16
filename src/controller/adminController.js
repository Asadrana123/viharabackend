const userModel = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");

// Create an admin account
exports.CreateAdmin = catchAsyncError(
  async (req, res) => {
    console.log(req.body);
    
    // Make sure the role is set to admin
    const adminData = {
      ...req.body,
      role: "admin"
    };
    
    const newAdmin = await userModel.create(adminData);
    sendToken(newAdmin, 201, res);
  }
);

exports.LogOut = catchAsyncError(
  async (req, res, next) => {
    res.cookie("token", null, {
      httpOnly: true,
      expires: new Date(Date.now())
    });
    return res.status(200).json({ success: true, message: "Admin Logout successfully" });
  }
);

// Get all users
exports.getAllUsers = catchAsyncError(
  async (req, res) => {
    const users = await userModel.find().select('-password');
    res.status(200).json({
      success: true,
      users
    });
  }
);

// Update user role
exports.updateUserRole = catchAsyncError(
  async (req, res, next) => {
    const { role } = req.body;
    
    if (!role || !["user", "admin"].includes(role)) {
      return next(new Errorhandler("Invalid role specified", 400));
    }
    
    const user = await userModel.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }
    
    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user
    });
  }
);
// Only adding the new admin-related functions to the user controller
// These should be added to your existing userController.js file

// Get all users (admin function)
exports.getAllUsers = catchAsyncError(
  async (req, res) => {
    const users = await userModel.find().select('-password');
    res.status(200).json({
      success: true,
      users
    });
  }
);

// Update user role (admin function)
exports.updateUserRole = catchAsyncError(
  async (req, res, next) => {
    const { role } = req.body;
    
    if (!role || !["user", "admin"].includes(role)) {
      return next(new Errorhandler("Invalid role specified", 400));
    }
    
    const user = await userModel.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }
    
    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user
    });
  }
);

// Delete user (admin function)
exports.deleteUser = catchAsyncError(
  async (req, res, next) => {
    const user = await userModel.findById(req.params.id);
    
    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }
    
    // Instead of hard deleting, you might want to soft delete by setting active to 0
    // and deleted_at to current date
    user.active = 0;
    user.deleted_at = Date.now();
    await user.save();
    
    // If you really want to delete the user from the database:
    // await userModel.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: "User deactivated successfully"
    });
  }
);