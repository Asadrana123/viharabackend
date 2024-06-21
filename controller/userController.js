const userModel=require("../model/userModel");
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
const sendToken=require("../utils/getToken");
exports.CreateUser=catchAsyncError(
     async(req,res)=>{
        console.log(req.body);
        const newUser =await userModel.create(req.body);
       sendToken(newUser,201,res);
     }
)
exports.Login=catchAsyncError(
    async(req,res,next)=>{
           const {email,password}=req.body;
           const finduser=await userModel.findOne({email}).select("+password");
           if(!finduser) return  next(new Errorhandler("Invalid Email or Password",400));
           const matchPassword=finduser.comparePassword(password);
          if(!matchPassword) return  next(new Errorhandler("Invalid Email or Password",400));
           sendToken(finduser,200,res);
    }
)
//catchAsyncError is a middleware function or wrapper that handles asynchronous errors.
//next (next middleware function in the Express pipeline).
//httpOnly: true: Ensures that the cookie is only accessible through HTTP(S) and cannot be accessed by client-side JavaScript, adding a layer of security.
exports.LogOut=catchAsyncError(
  async(req,res,next)=>{
    res.cookie("token",null,{
      httpOnly:true,
      expires: new Date(Date.now())
    })
    return res.status(200).json({success:true,message:"User Logout successfully"})
  }
)
