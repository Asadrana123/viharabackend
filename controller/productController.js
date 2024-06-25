const productModel=require("../model/productModel");
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
exports.createProduct=catchAsyncError(
    async(req,res)=>{
        const product=await productModel.create(req.body);
        return res.json({success:true,addedProduct:product});
    }
)
exports.getAllProducts=catchAsyncError(
     async (req,res)=>{
        const allProducts=await productModel.find({});
        return res.json({success:true,allProducts});
     }
)