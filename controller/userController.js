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
    console.log(req.params.token);
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
  async (req, res) => {
    const User = await userModel.findById(req.user.id).select("+password");
    const isMatchPassword = User.comparePassword(req.body.oldpassword);
    if (!isMatchPassword) {
      return next(new Errorhandler("OldPassword is wrong", 400));
    }
    if (req.body.newpassword !== req.body.confirmpassword) {
      return next(new Errorhandler("Passwords not matching", 400));
    }
    User.password = req.body.newpassword;
    await User.save();
    sendToken(User, 200, res);
  }
)
exports.forgotPassword = catchAsyncError(
  async (req, res, next) => {
    const { email } = req.body;
    console.log(email)
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
    <title>Password Reset</title>
    <style>
        body { 
            font-family: "Roboto", Helvetica, Arial, sans-serif;
            font-size: 16px; 
            color: black !important; 
            margin: 0; 
            padding: 0; 
        }
        p {
            color: black !important; 
            font-size:16px;
            font-weight:400;
        }
        .container { 
            width: 100%; 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff; 
            padding: 20px; 
        }
        .button {
            background-color: #0384fb; 
            color: #ffffff !important; 
            padding: 10px 20px; 
            text-decoration: none; 
            font-size: 16px; 
            border-radius: 5px;
            display: block;
            width: fit-content;
            margin: 20px auto;
            text-align: center;
            font-weight:700;
        }
        .footer-logo img {
            width: 120px;
            height:auto;
        }
        .social-icons img {
            width: 30px;
            height: 30px;
        }
        .contact-info {
            margin-top: 20px;
            font-size: 12px;
            color: #666666;
        }
        .contact-info a {
            color: #007BFF;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td>
                <table class="container" align="center" cellpadding="0" cellspacing="0" border="0">
                    <!-- Header -->
                <tr>
                        <td align="center" style="padding: 20px 0;border-bottom:1px solid #979797;padding-bottom:20px;">
                        <img src="https://www.vihara.ai/static/media/vihara-new-logo.1e0ecd4b8707813c361a.jpeg" alt="Company Logo" style="max-width: 120px;">
              </td>
        </tr>
        <tr>
    <td>
        <table width="100%" cellpadding="10" cellspacing="0" border="0" style="text-align: center;margin-bottom:10px;margin-top:10px;">
            <tr>
                <td style="font-size:16px; color: #3d5877; border-right: 1px solid #979797;">Bank Owned</td>
                <td style="font-size:16px;color: #3d5877; border-right: 1px solid #979797;">Foreclosure</td>
                <td style="font-size:16px;color: #3d5877;">Short Sales</td>
            </tr>
        </table>
    </td>
</tr>    
 <!-- Main Content -->
                    <tr>
                        <td>
                            <p>Hi ${User.name},</p>
                            <p>We received your request to reset your password. Please click on the link below or copy and paste the URL into your browser.</p>
                           <button class="button" style="border:none; background-color: #0384fb; color: #ffffff !important; padding: 10px 20px; text-decoration: none; font-size: 16px; border-radius: 5px; display: block; width: fit-content; margin: 20px auto; text-align: center; font-weight: 700;" > <a href="${resetUrl}" style="text-decoration:none;color:white">Reset Password</a></button>
                            <p>This reset URL is only valid for 30 days. If it expires, please visit our website, sign in, and request a new password reset link.</p>
                            <p>Your security is important to us. If you did not request to change your password, please ignore this email.</p>
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <p style="padding-bottom:20px;border-bottom:1px solid #979797;">Thank You,<br>The Vihara Team</p>
                        </td>
                    </tr>
                     <tr>
                       <td>
                        <p>
                 If you have any questions or received this  
                notification in error, please contact Customer Care at CustomerCare@Vihara.com. 
                To ensure you continue to receive
                emails from Vihara, please add noreply@email.Vihara.com to your address book.
                       </td>
                     </tr>
                     <tr>
                       <td>
                        <p>
               Vihara is a technology platform used by licensed real estate brokers and
                sellers to market properties and manage bids for those properties. For 
                more information about a property, including the listing broker's contact information, 
                please click on the property to view the details on Vihara.ai. 
                Foreclosure auction listings are not guaranteed to go to auction 
               and may be cancelled at any point prior to the auction start time.
                       </td>
                     </tr>
                    <!-- Footer -->
                    <tr>
                        <td class="contact-info">
                            <p>If you have any questions or need assistance, please contact our support team at <a href="mailto:trisha@vihara.com">trisha@vihara.com</a>.</p>
                            <p> RL Auction,<br></br> Inc. 1335 S Milpitas Blvd Milpitas, California 95035</p>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="left" width="50%">
                                        <img src="https://www.vihara.ai/static/media/vihara-new-logo.1e0ecd4b8707813c361a.jpeg" alt="Company Logo" class="footer-logo" style="width:120px;">
                                    </td>
                                    <td align="right" width="30%">
                                        <table class="social-icons" cellspacing="10" cellspacing="0" border="0">
                                            <tr>
                                                <td>
                                                    <a href="https://www.facebook.com"><img  style="width:30px;height:30px" src="https://ci3.googleusercontent.com/meips/ADKq_NYdCsK3DhV8iuJ7KDeQ4CZlaIT8Sd8dS-bL2M_9-lUDE--JPQiQHWc_FtdACnIkeFGtKIbrGuhcEFm3yManRJvDtAUz4D3UsqveC8gPdvJ0sA6EiRJURxk2OSEQxx55L7GHtY2RGINW87DbXx7fjVn0a26tV6c3BlnUTvrNCriS=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/e8f22763-dc43-4959-b3e9-5a8048b273a1.png" alt="Facebook"></a>
                                                </td>
                                                <td>
                                                    <a href="https://www.twitter.com"><img style="width:30px;height:30px" src="https://ci3.googleusercontent.com/meips/ADKq_Na1EsBWS9vfqdVpS9-mHalzjVCy6XyghIY8kjzp3PGKy-0rDx8O4peoE0epBbkg-qsA_qBPcMfSlcRNKE6rfM9FsErlgkJv5FA87ZmwoZA2q9Z46IrX6v3sWBWM_TBy87XvnCFu6gtcVtr6KumY932kiquePdG1xBkIZBdXFhG0=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/b67ecf84-4efa-431c-9b78-000164cf247c.png" alt="Twitter"></a>
                                                </td>
                                                <td>
                                                    <a href="https://www.linkedin.com"><img style="width:30px;height:30px" src="https://ci3.googleusercontent.com/meips/ADKq_NZSsc060crzcO_DBbMfwxA4yCle_n0m1ONl46fk_voetKez4PGuHkMsVkv3L-l8qI7jrNg32izm6m0AA2f3xg1-Eq6Hm0h2Mx01uw0ZCZb2pUYQYnyVVK6IGq0LGbfQY72fKk72zjySmaMB5ZTDw9YebJld3-NA1tCX03toHpuU=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/0ac84e3b-25d2-4bf7-81f1-740f7bfdc8c5.png" alt="LinkedIn"></a>
                                                </td>
                                                <td>
                                                    <a href="https://www.youtube.com"><img style="width:30px;height:30px" src="https://ci3.googleusercontent.com/meips/ADKq_Na43exfG770dgwf_6ah7ag4uFwZIVqzRfY3ER8T10aiIKRL6SUETzkHDIX2AI2O0oLDzwjnSoPWeomEVNdxGvpN21CfTQOdX6M35KCM7brGLptGqjG1-v0ju2BwoL_GSF7OG3D1OeV-R0sm29obAfJ7gtp4Bwz05MZieQ2rWRes=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/e2ae1bd7-6b6f-4608-9aff-88a06973551f.png" alt="YouTube"></a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Contact Info -->
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`
      )
      res.status(200).json({
        success: true,
        message: "Recovery Email sent to user"
      })
    } catch (error) {
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


