const userModel = require("../model/userModel");
const Form = require("../model/formDataModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");
const productModel = require("../model/productModel");
const sendEmail = require("../utils/sendEmail");
const { sendSmSOTP } = require("./otpController");
const mongoose = require('mongoose'); // Import mongoose
const axios = require("axios");
exports.CreateUser = catchAsyncError(
  async (req, res) => {
    // Create a new user
    const newUser = await userModel.create(req.body);
    // Populate the savedProperties field
    await newUser.populate({
      path: 'savedProperties', // assuming 'savedProperties' is the field that references another collection
      model: 'productModel' // replace 'productModel' with the name of the model you are referencing
    })
    try {
      // // const otp = await sendSmSOTP(newUser.businessPhone);
      sendEmail(
        req.body.email,
        newUser.name,
        "Welcome to Vihara",
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Vihara</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            font-size: 14px; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f5f5f5;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .header-section {
            background-color: #0384fb;
            padding: 30px 20px;
            text-align: center;
            position: relative;
        }
        
        .logo-container {
            position: absolute;
            top: 15px;
            left: 20px;
            background-color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            color: #333;
        }
        
        .vihara-logo {
            color: white;
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 2px;
            margin: 20px 0 10px 0;
        }
        
        .content-section {
            padding: 40px 30px;
            background-color: white;
        }
        
        .welcome-title {
            font-size: 24px;
            color: #333;
            margin-bottom: 20px;
            font-weight: normal;
        }
        
        .username-info {
            font-size: 16px;
            color: #333;
            margin-bottom: 25px;
        }
        
        .username-link {
            color: #0384fb;
            text-decoration: none;
        }
        
        .welcome-text {
            font-size: 16px;
            line-height: 1.6;
            color: #333;
            margin-bottom: 20px;
        }
        
        .highlight-text {
            color: #0384fb;
            font-weight: bold;
        }
        
        .get-started-button {
            background-color: #0384fb;
            color: white;
            padding: 12px 30px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
            font-weight: bold;
            margin: 30px 0;
            border-radius: 5px;
            cursor: pointer;
        }
        
        .help-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        
        .help-text {
            font-size: 16px;
            color: #333;
            margin-bottom: 10px;
        }
        
        .customer-service-link {
            color: #0384fb;
            text-decoration: none;
        }
        
        .thank-you-text {
            font-size: 16px;
            color: #333;
            margin-top: 20px;
        }
        
        .footer-section {
            background-color: #4a5568;
            padding: 30px;
            color: white;
            text-align: center;
        }
        
        .footer-logo {
            margin-bottom: 20px;
        }
        
        .footer-logo img {
            width: 40px;
            height: 40px;
            background-color: white;
            padding: 8px;
            border-radius: 4px;
        }
        
        .social-icons {
            margin: 20px 0;
        }
        
        .social-icon {
            display: inline-block;
            width: 35px;
            height: 35px;
            background-color: #6b7280;
            border-radius: 50%;
            margin: 0 5px;
            line-height: 35px;
            text-align: center;
            color: white;
            text-decoration: none;
            font-size: 16px;
        }
        
        .social-icon:hover {
            background-color: #0384fb;
        }
        
        .footer-copyright {
            font-size: 12px;
            color: #d1d5db;
            margin: 20px 0 10px 0;
            line-height: 1.4;
        }
        
        .footer-links {
            margin: 15px 0;
        }
        
        .footer-link {
            color: #d1d5db;
            text-decoration: underline;
            font-size: 12px;
        }
        
        .footer-privacy {
            font-size: 12px;
            color: #d1d5db;
            margin-top: 15px;
        }
        
        .footer-privacy a {
            color: #d1d5db;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header Section -->
        <div class="header-section">
            <div class="logo-container">Vihara.com</div>
            <div class="vihara-logo">vihara</div>
        </div>
        
        <!-- Content Section -->
        <div class="content-section">
            <h1 class="welcome-title">Welcome to Vihara Asad.</h1>
            
            <p class="username-info">
                Your username is: <a href="mailto:${newUser.email}" class="username-link">${newUser.email}</a>
            </p>
            
            <p class="welcome-text">
                Now that you have registered on <span class="highlight-text">vihara.com</span>, you have access to your own personal dashboard to save searches and properties, share your favorites, receive notifications when there is a price or status change, and more!
            </p>
            
            <div style="text-align: center;">
                <a href="${process.env.CLIENT_URL}" class="get-started-button">Get Started</a>
            </div>
            
            <div class="help-section">
                <p class="help-text">
                    Need help? Our <a href="mailto:trisha@vihara.com" class="customer-service-link">customer service</a> team is here to help.
                </p>
                
                <p class="thank-you-text">Thank you for choosing Vihara.</p>
            </div>
        </div>
        
        <!-- Footer Section -->
        <div class="footer-section">
            <div class="footer-logo">
                <div style="width: 40px; height: 40px; background-color: white; border-radius: 4px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                    <div style="width: 24px; height: 16px; background-color: #4a5568; border-radius: 2px;"></div>
                </div>
            </div>
            
            <div class="social-icons">
                <a href="#" class="social-icon">f</a>
                <a href="#" class="social-icon">𝕏</a>
                <a href="#" class="social-icon">in</a>
            </div>
            
            <div class="footer-copyright">
                © 2024 Vihara Inc.; Vihara CT LLC (for CT properties); Vihara PR LLC (for PR properties); Vihara Realty Services LLC. All rights reserved. 750 Highway 121 BYP, Suite 100, Lewisville, TX 75067.
            </div>
            
            <div class="footer-links">
                <a href="#" class="footer-link">View our licensing page here.</a>
            </div>
            
            <div class="footer-privacy">
                We respect your right to privacy. View our policy <a href="#">here</a>.
            </div>
        </div>
    </div>
</body>
</html>`
      );
      sendToken(newUser, 201, res, "----");
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error sending OTP', error: error.message });
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
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid User ID' });
    }
    // Ensure that userType is valid if it's being updated
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      { $set: updates }, // Use $set to update only the provided fields
      { new: true, runValidators: true } // new: true returns the updated document, runValidators ensures validation is applied
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
exports.LogOut = catchAsyncError(
  async (req, res, next) => {
    res.cookie("token", null, {
      httpOnly: true,
      expires: new Date(Date.now())
    })
    return res.status(200).json({ success: true, message: "User Logout successfully" })
  }
)
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
    const message = `Your reset password token is:- /n/n ${resetUrl}, if You have not requested then please ignore it`
    try {
      sendEmail(
        req.body.email,
        User.name,
        "Email password recovery",
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - Vihara</title>
    <style>
        body { 
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 16px; 
            color: #333333; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            background-color: #ffffff;
            padding: 40px 40px 20px 40px;
            text-align: center;
            border-bottom: 1px solid #e9ecef;
        }
        .logo {
            max-width: 150px;
            height: auto;
        }
        .main-content {
            padding: 40px;
            text-align: center;
        }
        .greeting {
            font-size: 18px;
            color: #333333;
            margin-bottom: 20px;
            font-weight: 500;
        }
        .message {
            font-size: 16px;
            color: #666666;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .reset-button {
            background-color: #007bff;
            color: #ffffff !important;
            padding: 16px 32px;
            text-decoration: none;
            font-size: 16px;
            font-weight: 600;
            border-radius: 8px;
            display: inline-block;
            margin: 20px 0;
            transition: background-color 0.3s ease;
        }
        .reset-button:hover {
            background-color: #0056b3;
        }
        .expiry-notice {
            font-size: 14px;
            color: #666666;
            margin: 20px 0;
        }
        .security-notice {
            background-color: #f8f9fa;
            border-left: 4px solid #007bff;
            padding: 20px;
            margin: 30px 0;
            font-size: 14px;
            color: #666666;
            text-align: left;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px 40px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }
        .footer-text {
            font-size: 14px;
            color: #666666;
            line-height: 1.5;
            margin-bottom: 20px;
        }
        .contact-info {
            font-size: 14px;
            color: #666666;
            margin-bottom: 20px;
        }
        .contact-info a {
            color: #007bff;
            text-decoration: none;
        }
        .company-info {
            font-size: 12px;
            color: #999999;
            line-height: 1.4;
        }
        .help-section {
            background-color: #e3f2fd;
            padding: 25px;
            margin: 20px 0;
            border-radius: 8px;
            text-align: center;
        }
        .help-title {
            font-size: 18px;
            font-weight: 600;
            color: #1565c0;
            margin-bottom: 10px;
        }
        .help-text {
            font-size: 14px;
            color: #1565c0;
            margin-bottom: 15px;
        }
        .help-contact {
            font-size: 14px;
            color: #1565c0;
        }
        .help-contact a {
            color: #1565c0;
            text-decoration: none;
            font-weight: 600;
        }
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 0;
            }
            .header, .main-content, .footer {
                padding: 20px;
            }
            .reset-button {
                padding: 14px 24px;
                width: 80%;
                box-sizing: border-box;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header with Logo -->
        <div class="header">
            <img src="https://www.vihara.ai/static/media/vihara-new-logo.1e0ecd4b8707813c361a.jpeg" alt="Vihara Logo" class="logo">
        </div>

        <!-- Main Content -->
        <div class="main-content">
            <div class="greeting">Hello ${User.name},</div>
            
            <div class="message">
                Please click the link below to update your <strong>Vihara.com</strong> account password.
            </div>

            <a href="${resetUrl}" class="reset-button">Reset Password</a>
            
            <div class="expiry-notice">
                The link will be active for only 24 hours.
            </div>

            <div class="security-notice">
                <strong>Security Notice:</strong> Your security is important to us. If you did not request to change your password, please ignore this email and your password will remain unchanged.
            </div>
        </div>

        <!-- Help Section -->
        <div class="help-section">
            <div class="help-title">Questions? We're here to help.</div>
            <div class="help-text">Mon-Fri from 9am - 6pm PT or email</div>
            <div class="help-contact">
                Contact us at <a href="mailto:trisha@vihara.com">trisha@vihara.com</a>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                <strong>Regards,</strong><br>
                <strong>Vihara.com</strong>
            </div>
            
            <div class="contact-info">
                If you have any questions or need assistance, please contact our support team at 
                <a href="mailto:trisha@vihara.com">trisha@vihara.com</a>
            </div>
            
            <div class="company-info">
                <strong>RL Auction, Inc.</strong><br>
                1335 S Milpitas Blvd, Milpitas, California 95035<br><br>
                
                Vihara is a technology platform used by licensed real estate brokers and sellers to market properties and manage bids for those properties. For more information about a property, including the listing broker's contact information, please click on the property to view the details on Vihara.ai.
            </div>
        </div>
    </div>
</body>
</html>
`
      )
      res.status(200).json({
        success: true,
        message: "Recovery Email sent to user"
      })
    } catch (error) {
      console.log(error,'main error');
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


