const adminModel=require("../model/adminModel");
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
const sendToken=require("../utils/getToken");
exports.CreateAdmin=catchAsyncError(
     async(req,res)=>{
        console.log(req.body);
        const newAdmin =await adminModel.create(req.body);
       sendToken(newAdmin,201,res);
     }
)
exports.Login=catchAsyncError(
    async(req,res,next)=>{
           const {email,password}=req.body;
           console.log(email,password);
           const findAdmin=await adminModel.findOne({email}).select("+password");
           if(!findAdmin) return  next(new Errorhandler("Invalid Email or Password",400));
           const matchPassword=findAdmin.comparePassword(password);
          if(!matchPassword) return  next(new Errorhandler("Invalid Email or Password",400));
           sendToken(findAdmin,200,res);
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
    return res.status(200).json({success:true,message:"Admin Logout successfully"})
  }
)
