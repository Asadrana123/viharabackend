
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
const adminModel=require("../model/adminModel")
const jwt=require("jsonwebtoken");
exports.verifyAdmin=catchAsyncError(async (req,res,next)=>{
      const {token}=req.cookies;
      if(!token){
          next(new Errorhandler("Token is required to acess",201))
      }
      const decodedId=jwt.verify(token,process.env.secret);
      req.user=await adminModel.findOne({_id:decodedId.id});
      next();
})
