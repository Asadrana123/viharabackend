const userModel = require("../model/userModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendToken = require("../utils/getToken");
const productModel = require("../model/productModel");
const sendEmail = require("../utils/sendEmail");
const axios =require("axios");
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
      sendEmail(req.email, req.name);
      sendToken(newUser, 201, res,response.data.Details);
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
    console.log(matchPassword,"password");
    if (!matchPassword) return next(new Errorhandler("Invalid Password", 400));
    sendEmail(finduser.email, finduser.name);
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
exports.resetPassword=catchAsyncError(
  async(req,res,next)=>{
     console.log(req.params.token);
      const resetPasswordToken=require("crypto").createHash("sha256").update(req.params.token).digest("hex");
      const User=await userModel.findOne({resetPasswordToken,
       resetPasswordExpire:{$gt:Date.now()}
     })
     if(!User){
         return next(new Errorhandler("resetPassword token is invalid or has been expired",400));
     }
     User.password=req.body.password;
     User.resetPasswordToken=undefined;
     User.resetPasswordExpire=undefined;
     await User.save({validateBeforeSave:false})
     sendToken(User,200,res);
  }
)
exports.updatePassword=catchAsyncError(
  async(req,res)=>{
       const User=await userModel.findById(req.user.id).select("+password");
       const isMatchPassword=User.comparePassword(req.body.oldpassword);
       if(!isMatchPassword){
         return next(new Errorhandler("OldPassword is wrong",400));
       }
       if(req.body.newpassword!==req.body.confirmpassword){
         return next(new Errorhandler("Passwords not matching",400));
       }
       User.password=req.body.newpassword;
       await User.save();
       sendToken(User,200,res);
  }
)
exports.forgotPassword=catchAsyncError(
  async(req,res,next)=>{
      const {email}=req.body;
      console.log(email)
      const User=await userModel.findOne({email});
      if(!User){
        return next(new Errorhandler("No user found with this email",404));
      }
      const resetPasswordtoken=User.getResetPasswordToken();
      await User.save({validateBeforeSave:false});
      const resetUrl=`${process.env.CLIENT_URL}/set-new-password/${resetPasswordtoken}`; 
      const message=`Your reset password token is:- /n/n ${resetUrl}, if You have not requested then please ignore it`
      try{
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
                        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
                        .container { width: 100%; max-width: 600px; margin: 0 auto; padding: 20px; }
                        .button { background-color: #007BFF; color: #ffffff; padding: 10px 20px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 10px 0; cursor: pointer; border-radius: 5px; }
                        .footer { font-size: 12px; color: #666; }
                        .header { font-size: 20px; color: #333; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="header">Hi ${User.name},</h1>
                        <p>We received your request to reset your password. Please click on the link below or copy and paste the URL into your browser.</p>
                        <a href="${resetUrl}" class="button">Reset Password</a>
                        <p>This URL is only valid for 30 days. If it expires, please visit our website.</p>
                        <p>Your security is important to us. If you did not request to change your password, please ignore this email.</p>
                        <p>Thank you,<br>The Vihara Team</p>
                        <hr>
                        <p class="footer">If you have any questions or need further assistance, please contact Customer Care at trisha@vihara.com.</p>
                    </div>
                </body>
                </html>`
                
              )  
              res.status(200).json({
                success:true,
                message:"Recovery Email sent to user"
              })
      }catch(error){
          User.resetPasswordToken=undefined;
          User.resetPasswordExpire=undefined;
          await User.save({validation:false});
          return next(new Errorhandler(error.message,500));
      }
  }
)