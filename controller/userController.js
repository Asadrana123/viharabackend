const userModel = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");
const productModel = require("../model/productModel");
const sendEmail = require("../utils/sendEmail");
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
    console.log(newUser.businessPhone);
    try {
      const response = await axios.get(`https://2factor.in/API/V1/${process.env.OTP_API_KEY}/SMS/${newUser.businessPhone}/AUTOGEN3`);
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
                body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
                .container { width: 90%; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; border-radius: 8px; }
                .button { background-color: #0384fb; color: white; padding: 10px 20px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 10px 0; cursor: pointer; border-radius: 5px; }
                .footer { font-size: 12px; color: #666; }
                .header { font-size: 24px; color: #333; }
                .welcome-text { font-size: 16px; line-height: 1.6; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 class="header">Welcome to Vihara, ${newUser.name}!</h1>
                <p class="welcome-text">We're thrilled to have you on board! At Vihara, we strive to provide you with the best experience possible. Whether you're exploring our platform or getting started, we want you to know that we're here to support you every step of the way.</p>
                <p class="welcome-text">Feel free to explore our services, and don't hesitate to reach out if you need any assistance. We’re excited to see what you achieve with Vihara!</p>
                <a href="${process.env.CLIENT_URL}" class="button">Explore Now</a>
                <p class="welcome-text">Thank you for joining us.<br>Best Regards,<br>The Vihara Team</p>
                <hr>
                <p class="footer">If you have any questions or need assistance, don't hesitate to reach out to our support team at trisha@vihara.com.</p>
            </div>
        </body>
        </html>`
      );

      sendToken(newUser, 201, res, response.data.Details);
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
    const finduser = await userModel.findOne({ email }).select("+password").populate({
      path: 'savedProperties', // assuming 'savedProperties' is the field that references another collection
      model: 'productModel' // replace 'product' with the name of the model you are referencing
    });
    if (!finduser) return next(new Errorhandler("Invalid Email", 400));
    const matchPassword = await finduser.comparePassword(password);
    console.log(matchPassword, "password");
    if (!matchPassword) return next(new Errorhandler("Invalid Password", 400));
    sendEmail(
      req.body.email,
      finduser.name,
      "Welcome to Vihara",
      `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Vihara</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
                .container { width: 90%; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; border-radius: 8px;padding:20px }
                .button { background-color: #28a745; color: #ffffff; padding: 10px 20px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 10px 0; cursor: pointer; border-radius: 5px; }
                .footer { font-size: 12px; color: #666; }
                .header { font-size: 24px; color: #333; }
                .welcome-text { font-size: 16px; line-height: 1.6; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 class="header">Welcome to Vihara, ${finduser.name}!</h1>
                <p class="welcome-text">We're thrilled to have you on board! At Vihara, we strive to provide you with the best experience possible. Whether you're exploring our platform or getting started, we want you to know that we're here to support you every step of the way.</p>
                <p class="welcome-text">Feel free to explore our services, and don't hesitate to reach out if you need any assistance. We’re excited to see what you achieve with Vihara!</p>
                <a href="${process.env.CLIENT_URL}" class="button">Explore Now</a>
                <p class="welcome-text">Thank you for joining us.<br>Best Regards,<br>The Vihara Team</p>
                <hr>
                <p class="footer">If you have any questions or need assistance, don't hesitate to reach out to our support team at trisha@vihara.com.</p>
            </div>
        </body>
        </html>`
    );
    sendToken(finduser, 200, res);
  }
)
//catchAsyncError is a middleware function or wrapper that handles asynchronous errors.
//next (next middleware function in the Express pipeline).
//httpOnly: true: Ensures that the cookie is only accessible through HTTP(S) and cannot be accessed by client-side JavaScript, adding a layer of security.
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
            font-family: Arial, sans-serif; 
            font-size: 14px; 
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
                <td style="font-size: 14px; color: #3d5877; border-right: 1px solid #979797;">Bank Owned</td>
                <td style="font-size: 14px; color: #3d5877; border-right: 1px solid #979797;">Foreclosures</td>
                <td style="font-size: 14px; color: #3d5877; border-right: 1px solid #979797;">Vacant</td>
                <td style="font-size: 14px; color: #3d5877;">Cash Only</td>
            </tr>
        </table>
    </td>
</tr>    
 <!-- Main Content -->
                    <tr>
                        <td>
                            <p>Hi <strong>${User.name}</strong>,</p>
                            <p>We received your request to reset your password. Please click on the link below or copy and paste the URL into your browser.</p>
                            <a href="${resetUrl}" class="button">Reset Password</a>
                            <p>This reset URL is only valid for 30 days. If it expires, please visit our website, sign in, and request a new password reset link.</p>
                            <p>Your security is important to us. If you did not request to change your password, please ignore this email.</p>
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <p>Thank You,<br>The Vihara Team</p>
                        </td>
                    </tr>

                    <!-- Footer -->
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
                                                    <a href="https://www.facebook.com"><img src="https://ci3.googleusercontent.com/meips/ADKq_NYdCsK3DhV8iuJ7KDeQ4CZlaIT8Sd8dS-bL2M_9-lUDE--JPQiQHWc_FtdACnIkeFGtKIbrGuhcEFm3yManRJvDtAUz4D3UsqveC8gPdvJ0sA6EiRJURxk2OSEQxx55L7GHtY2RGINW87DbXx7fjVn0a26tV6c3BlnUTvrNCriS=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/e8f22763-dc43-4959-b3e9-5a8048b273a1.png" alt="Facebook"></a>
                                                </td>
                                                <td>
                                                    <a href="https://www.twitter.com"><img src="https://ci3.googleusercontent.com/meips/ADKq_Na1EsBWS9vfqdVpS9-mHalzjVCy6XyghIY8kjzp3PGKy-0rDx8O4peoE0epBbkg-qsA_qBPcMfSlcRNKE6rfM9FsErlgkJv5FA87ZmwoZA2q9Z46IrX6v3sWBWM_TBy87XvnCFu6gtcVtr6KumY932kiquePdG1xBkIZBdXFhG0=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/b67ecf84-4efa-431c-9b78-000164cf247c.png" alt="Twitter"></a>
                                                </td>
                                                <td>
                                                    <a href="https://www.linkedin.com"><img src="https://ci3.googleusercontent.com/meips/ADKq_NZSsc060crzcO_DBbMfwxA4yCle_n0m1ONl46fk_voetKez4PGuHkMsVkv3L-l8qI7jrNg32izm6m0AA2f3xg1-Eq6Hm0h2Mx01uw0ZCZb2pUYQYnyVVK6IGq0LGbfQY72fKk72zjySmaMB5ZTDw9YebJld3-NA1tCX03toHpuU=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/0ac84e3b-25d2-4bf7-81f1-740f7bfdc8c5.png" alt="LinkedIn"></a>
                                                </td>
                                                <td>
                                                    <a href="https://www.youtube.com"><img src="https://ci3.googleusercontent.com/meips/ADKq_Na43exfG770dgwf_6ah7ag4uFwZIVqzRfY3ER8T10aiIKRL6SUETzkHDIX2AI2O0oLDzwjnSoPWeomEVNdxGvpN21CfTQOdX6M35KCM7brGLptGqjG1-v0ju2BwoL_GSF7OG3D1OeV-R0sm29obAfJ7gtp4Bwz05MZieQ2rWRes=s0-d-e1-ft#https://image.s11.sfmc-content.com/lib/fe3a11717164047d7d1572/m/1/e2ae1bd7-6b6f-4608-9aff-88a06973551f.png" alt="YouTube"></a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Contact Info -->
                    <tr>
                        <td class="contact-info">
                            <p>If you have any questions or need assistance, please contact our support team at <a href="mailto:trisha@vihara.com">trisha@vihara.com</a>.</p>
                            <p>Altisource Online Auction, Inc.<br>2300 Lakeview Parkway, 7th Floor, Space 756, Alpharetta, GA 30009</p>
                        </td>
                    </tr>
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