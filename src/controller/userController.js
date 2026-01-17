const userModel = require("../model/userModel");
const userPreferencesModel = require('../model/userPreferencesModel.js')
const savedSearches = require('../model/savedSearch.js')
const Form = require("../model/formDataModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");
const productModel = require("../model/productModel");
const sendEmail = require("../utils/sendEmail");
const { sendSmSOTP } = require("./otpController");
const { createPasswordResetEmail, createWelcomeEmail } = require("../utils/emailTemplates.js");
const getCookieOptions = require("../utils/cookieOptions");
const mongoose = require('mongoose'); // Import mongoose
const axios = require("axios");
exports.CreateUser = catchAsyncError(
  async (req, res) => {
    // Destructure the request body with consent
    const {
      consentToNotifications,
      ...userData
    } = req.body;

    // Create a new user with consent handling
    const newUser = await userModel.create({
      ...userData,
      consents: {
        dataProcessing: {
          granted: consentToNotifications || false,
          grantedAt: consentToNotifications ? Date.now() : null,
          version: "1.0"
        }
      }
    });

    // Populate the savedProperties field
    await newUser.populate({
      path: 'savedProperties',
      model: 'productModel'
    });

    // Create welcome email
    const welcomeEmailHtml = createWelcomeEmail(newUser, process.env.CLIENT_URL);

    try {
      // Send welcome email
      sendEmail(
        newUser.email,
        newUser.name,
        "Welcome to Vihara",
        welcomeEmailHtml
      );

      // Send token response
      sendToken(newUser, 201, res, "User created successfully");
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating user',
        error: error.message
      });
    }
  }
);
exports.getAllEmailandPhone = catchAsyncError(
  async (req, res, next) => {
    try {
      // Find all users and select only the email and phoneNumber fields
      const users = await userModel.find().select('email businessPhone');
      // Extract emails and phoneNumbers into an array of objects
      const contacts = users.map(user => ({
        email: user.email,
        businessPhone: user.businessPhone
      }));

      // Send the array of contacts to the frontend
      return res.status(200).json({ contacts });
    } catch (error) {
      return next(new Errorhandler("Error fetching contacts", 500));
    }
  }
);
exports.Login = catchAsyncError(
  async (req, res, next) => {
    const { email, password } = req.body;
    console.log(email, password);
    const finduser = await userModel.findOne({ email }).select("+password").populate({
      path: 'savedProperties', // assuming 'savedProperties' is the field that references another collection
      model: 'productModel' // replace 'product' with the name of the model you are referencing
    });
    if (!finduser) return next(new Errorhandler("Invalid Email", 400));
    const matchPassword = await finduser.comparePassword(password);
    console.log(matchPassword, "password");
    if (!matchPassword) return next(new Errorhandler("Invalid Password", 400));
    // sendEmail(
    //   req.body.email,
    //   finduser.name,
    //   "Welcome to Vihara",
    //   `<!DOCTYPE html>
    //     <html lang="en">
    //     <head>
    //         <meta charset="UTF-8">
    //         <meta name="viewport" content="width=device-width, initial-scale=1.0">
    //         <title>Welcome to Vihara</title>
    //         <style>
    //             body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
    //             .container { width: 90%; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; border-radius: 8px;padding:20px }
    //             .button { background-color: #28a745; color: #ffffff; padding: 10px 20px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 10px 0; cursor: pointer; border-radius: 5px; }
    //             .footer { font-size: 12px; color: #666; }
    //             .header { font-size: 24px; color: #333; }
    //             .welcome-text { font-size: 16px; line-height: 1.6; }
    //         </style>
    //     </head>
    //     <body>
    //         <div class="container">
    //             <h1 class="header">Welcome to Vihara, ${finduser.name}!</h1>
    //             <p class="welcome-text">We're thrilled to have you on board! At Vihara, we strive to provide you with the best experience possible. Whether you're exploring our platform or getting started, we want you to know that we're here to support you every step of the way.</p>
    //             <p class="welcome-text">Feel free to explore our services, and don't hesitate to reach out if you need any assistance. We’re excited to see what you achieve with Vihara!</p>
    //             <a href="${process.env.CLIENT_URL}" class="button">Explore Now</a>
    //             <p class="welcome-text">Thank you for joining us.<br>Best Regards,<br>The Vihara Team</p>
    //             <hr>
    //             <p class="footer">If you have any questions or need assistance, don't hesitate to reach out to our support team at trisha@vihara.com.</p>
    //         </div>
    //     </body>
    //     </html>`
    // );
    sendToken(finduser, 200, res, "----");
  }
)
exports.sendOTP = catchAsyncError(async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  sendEmail(
    email,
    "Hello user",
    "Your OTP for Vihara",
    `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your OTP for email change</title>
          <style>
              body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
              .container { width: 90%; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; border-radius: 8px;padding:20px }
              .button { background-color: #28a745; color: #ffffff; padding: 10px 20px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 10px 0; cursor: pointer; border-radius: 5px; }
              .footer { font-size: 12px; color: #666; }
              .header { font-size: 24px; color: #333; }
              .otp-text { font-size: 18px; font-weight: bold; color: #d9534f; }
              .welcome-text { font-size: 16px; line-height: 1.6; }
          </style>
      </head>
      <body>
          <div class="container">
              <p class="welcome-text">Your OTP for Vihara is:</p>
              <p class="otp-text">${otp}</p>
              <p class="welcome-text">Thank you for using Vihara!<br>Best Regards,<br>The Vihara Team</p>
              <hr>
              <p class="footer">If you have any questions, feel free to contact us at trisha@vihara.com.</p>
          </div>
      </body>
      </html>`
  );

  res.status(200).json({
    success: true,
    otp: otp,
    message: `OTP sent to ${email}`,
  });
});
//catchAsyncError is a middleware function or wrapper that handles asynchronous errors.
//next (next middleware function in the Express pipeline).
//httpOnly: true: Ensures that the cookie is only accessible through HTTP(S) and cannot be accessed by client-side JavaScript, adding a layer of security.
exports.updateUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    console.log(updates);
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid User ID' });
    }

    const updateOperation = {
      $set: {
        ...updates,
        ...(updates.notificationConsent !== undefined && {
          'consents.dataProcessing.granted': updates.notificationConsent,
          'consents.dataProcessing.grantedAt': updates.notificationConsent ? Date.now() : null,
          'consents.dataProcessing.version': '1.1' // Update version if consent changes
        })
      }
    };

    // Remove notificationConsent from updates to prevent duplicate processing
    delete updateOperation.$set.notificationConsent;

    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      updateOperation,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error updating user',
      error: error.message
    });
  }
};
exports.LogOut = catchAsyncError(async (req, res, next) => {
  res
    .status(200)
    .clearCookie("token", getCookieOptions()) // Automatically uses the correct flags
    .json({
      success: true,
      message: "User logout successfully",
    });
});
exports.saveProperty = catchAsyncError(
  async (req, res, next) => {
    const { product_id, user_id } = req.body;
    console.log(user_id);
    const findProduct = await productModel.findById(product_id);
    if (!findProduct) return next(new Errorhandler("Product not found", 404));
    const findUser = await userModel.findById(user_id).populate({
      path: 'savedProperties', // assuming 'savedProperties' is the field that references another collection
      model: 'productModel' // replace 'product' with the name of the model you are referencing
    });
    findUser.savedProperties.push(findProduct);
    await findUser.save();
    return res.status(200).json({ sucess: true, message: "property saved sucessfully", user: findUser })
  }
)
exports.removeProperty = catchAsyncError(
  async (req, res, next) => {
    const { product_id, user_id } = req.body;
    console.log(user_id);

    const findProduct = await productModel.findById(product_id);
    if (!findProduct) return next(new Errorhandler("Product not found", 404));

    const findUser = await userModel.findById(user_id).populate({
      path: 'savedProperties', // assuming 'savedProperties' is the field that references another collection
      model: 'productModel' // replace 'product' with the name of the model you are referencing
    });

    // Remove the product from the savedProperties array
    findUser.savedProperties = findUser.savedProperties.filter(
      property => property._id.toString() !== product_id
    );

    await findUser.save();
    return res.status(200).json({ success: true, message: "Property removed successfully", user: findUser });
  }
);

exports.allsavedProperties = catchAsyncError(
  async (req, res, next) => {
    const userId = req.query.user_id;
    console.log(userId);
    const findUser = await userModel.findById(userId).populate("savedProperties");
    if (!findUser) return next(new Errorhandler("User not found", 404));
    return res.status(200).json({ sucess: true, savedProperties: findUser.savedProperties })
  }
)
exports.getUser = catchAsyncError(
  async (req, res, next) => {
    const user_id = req.user._id;
    console.log(user_id);
    const findUser = await userModel.findById(user_id).populate("savedProperties");
    if (!findUser) return next(new Errorhandler("User not found", 404));
    return res.status(200).json({ user: findUser });
  }
)
exports.getAllEmails = catchAsyncError(
  async (req, res, next) => {
    try {
      // Find all users and select only the email field
      const users = await userModel.find().select('email');

      // Extract the emails into an array
      const emails = users.map(user => user.email);

      // Send the array of emails to the frontend
      return res.status(200).json({ emails });
    } catch (error) {
      return next(new Errorhandler("Error fetching emails", 500));
    }
  }
);
exports.resetPassword = catchAsyncError(
  async (req, res, next) => {
    const resetPasswordToken = require("crypto").createHash("sha256").update(req.params.token).digest("hex");
    const User = await userModel.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    })
    if (!User) {
      return next(new Errorhandler("resetPassword token is invalid or has been expired", 400));
    }
    User.password = req.body.password;
    User.resetPasswordToken = undefined;
    User.resetPasswordExpire = undefined;
    await User.save({ validateBeforeSave: false })
    sendToken(User, 200, res);
  }
)
exports.updatePassword = catchAsyncError(
  async (req, res, next) => {
    const { oldpassword, newpassword, confirmpassword } = req.body;

    // Validation
    if (!oldpassword || !newpassword || !confirmpassword) {
      return next(new Errorhandler("All fields are required", 400));
    }

    if (newpassword !== confirmpassword) {
      return next(new Errorhandler("Passwords not matching", 400));
    }

    if (newpassword.length < 8) {
      return next(new Errorhandler("New password must be at least 8 characters long", 400));
    }

    // Get user with password field
    const user = await userModel.findById(req.user._id).select("+password");

    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }

    // Check if old password is correct
    const isMatchPassword = await user.comparePassword(oldpassword);
    if (!isMatchPassword) {
      return next(new Errorhandler("OldPassword is wrong", 400));
    }

    // Check if new password is different from old password
    const isSamePassword = await user.comparePassword(newpassword);
    if (isSamePassword) {
      return next(new Errorhandler("New password must be different from current password", 400));
    }

    // Update password
    user.password = newpassword;
    await user.save();

    // Send success response (don't send token for password change)
    res.status(200).json({
      success: true,
      message: "Password updated successfully"
    });
  }
);
exports.forgotPassword = catchAsyncError(
  async (req, res, next) => {
    const { email } = req.body;
    const User = await userModel.findOne({ email });
    if (!User) {
      return next(new Errorhandler("No user found with this email", 404));
    }
    const resetPasswordtoken = User.getResetPasswordToken();
    await User.save({ validateBeforeSave: false });
    const resetUrl = `${process.env.CLIENT_URL}/set-new-password/${resetPasswordtoken}`;
    const passwordResetEmail = createPasswordResetEmail(User.name, resetUrl);
    // const message = `Your reset password token is:- /n/n ${resetUrl}, if You have not requested then please ignore it`
    try {
      sendEmail(
        req.body.email,
        User.name,
        "Email password recovery",
        passwordResetEmail
      )
      res.status(200).json({
        success: true,
        message: "Recovery Email sent to user"
      })
    } catch (error) {
      console.log(error, 'main error');
      User.resetPasswordToken = undefined;
      User.resetPasswordExpire = undefined;
      await User.save({ validation: false });
      return next(new Errorhandler(error.message, 500));
    }
  }
)
exports.recaptcha = catchAsyncError(
  async (req, res, next) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Token is missing." });
    }
    try {
      const secretKey = '6LfUu5gqAAAAAOZ3fRsN5A5fTcus1NzxueGkmKZy';
      const response = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
      );
      const { success } = response.data;

      if (success) {
        return res.json({ success: true, message: "CAPTCHA verified successfully!" });
      } else {
        return res.status(400).json({ success: false, message: "CAPTCHA verification failed." });
      }
    } catch (error) {
      console.error("Error verifying CAPTCHA:", error);
      return res.status(500).json({ success: false, message: "Server error." });
    }
  }
)


// Controller to handle form submission
exports.submitForm = catchAsyncError(
  async (req, res) => {
    const { firstName, lastName, companyName, email, phone, contactMethods } = req.body;

    // Validate the data (you can add more validations as needed)
    if (!firstName || !lastName || !companyName || !email || !contactMethods) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
      // Create a new form document
      const formData = new Form({
        firstName,
        lastName,
        companyName,
        email,
        phone: contactMethods.includes("phone") ? phone : '',
        contactMethods,
      });

      // Save the form data in the database
      await formData.save();

      // Respond with success message
      res.status(200).json({
        success: true,
        message: 'Form submitted successfully!',
      });
    } catch (error) {
      console.error("Error saving form data:", error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while saving the data.',
      });
    }
  }
)


// Export User Data
exports.exportUserData = catchAsyncError(
  async (req, res) => {
    const userId = req.user._id;

    // Fetch user data from different models
    const userData = await userModel.findById(userId)
      .populate('savedProperties') // Populate saved properties
      .lean(); // Convert to plain JavaScript object

    const exportData = {
      personalInfo: {
        name: userData.name,
        lastName: userData.last_name,
        email: userData.email,
        createdAt: userData.createdAt
      },
      savedProperties: userData.savedProperties,
      userPreferences: await userPreferencesModel.findOne({ userId }),
      savedSearches: await savedSearches.find({ user: userId })
    };

    res.json({
      success: true,
      data: exportData
    });
  }
);

// Account Deletion
exports.deleteAccount = catchAsyncError(
  async (req, res) => {
    const userId = req.user._id;

    // Soft delete: Anonymize user data
    await userModel.findByIdAndUpdate(userId, {
      name: 'Deleted User',
      last_name: 'Account',
      email: `deleted_${userId}@vihara.ai`,
      active: false,
      deleted_at: new Date()
    });
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  }
);
