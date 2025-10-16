const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
const SellerForm=require("../model/sellingModel");
exports.sellProperty=catchAsyncError(
      async(req,res,next)=>{
          const sellProperty=await SellerForm.create(req.body);
          return res.status(200).json({sucess:true,sellProperty});
      }
)