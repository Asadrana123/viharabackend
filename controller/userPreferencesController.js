const UserPreference = require("../model/userPreferencesModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

// Save or update user preferences
exports.saveUserPreferences = catchAsyncError(
  async (req, res, next) => {
    const userId = req.user._id;
    const preferencesData = req.body;

    // Find existing preferences or create new ones
    let userPreferences = await UserPreference.findOne({ userId });

    if (userPreferences) {
      // Update existing preferences
      Object.keys(preferencesData).forEach(key => {
        userPreferences[key] = preferencesData[key];
      });
      
      await userPreferences.save();
    } else {
      // Create new preferences
      userPreferences = await UserPreference.create({
        userId,
        ...preferencesData
      });
    }

    res.status(200).json({
      success: true,
      message: "Preferences saved successfully",
      preferences: userPreferences
    });
  }
);

// Get user preferences
exports.getUserPreferences = catchAsyncError(
  async (req, res, next) => {
    const userId = req.user._id;

    const userPreferences = await UserPreference.findOne({ userId });

    if (!userPreferences) {
      return res.status(200).json({
        success: true,
        message: "No preferences found",
        preferences: null
      });
    }

    res.status(200).json({
      success: true,
      preferences: userPreferences
    });
  }
);

// Delete user preferences
exports.deleteUserPreferences = catchAsyncError(
  async (req, res, next) => {
    const userId = req.user._id;

    const userPreferences = await UserPreference.findOneAndDelete({ userId });

    if (!userPreferences) {
      return next(new ErrorHandler("No preferences found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Preferences deleted successfully"
    });
  }
);