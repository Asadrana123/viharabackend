
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
const userModel=require("../model/userModel")
const jwt=require("jsonwebtoken");
exports.isAuthenticated=catchAsyncError(async (req,res,next)=>{
    const token =
    req.body.token ||
    req.query.token ||
    req.headers.authorization.split(" ")[1];
      if(!token){
          next(new Errorhandler("Token is required to acess",201))
      }
      const decodedId=jwt.verify(token,process.env.secret);
      req.user=await userModel.findOne({_id:decodedId.id});
      next();
})
