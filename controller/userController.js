const userModel=require("../model/userModel");
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
const sendToken=require("../utils/getToken");
const productModel=require("../model/productModel");
exports.CreateUser=catchAsyncError(
     async(req,res)=>{
        console.log(req.body);
        const newUser =(await userModel.create(req.body)).populate("savedProperties");
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
exports.saveProperty=catchAsyncError(
    async(req,res)=>{
      const {productId}=req.body;
      const findProduct=await productModel.findById(productId);
      if(!findProduct) return next(new Errorhandler("Product not found",404));
      const findUser=await userModel.findById(req.user.id);
      findUser.savedProperties.push(findProduct);
      await findUser.save();
      return res.status(200).json({sucess:true,message:"property saved sucessfully"})
    }
)
