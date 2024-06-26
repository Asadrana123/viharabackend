const savePropertiesModel=require("../model/savePropertiesModel");
const catchAsyncError=require("../middleware/catchAsyncError");
const Errorhandler=require("../utils/errorhandler");
exports.saveProperty=catchAsyncError(
    async(req,res)=>{
        const savedProperty=await savePropertiesModel.create(req.body);
        return res.json({success:true,savedProperty:savedProperty});
    }
)
exports.getAllSavedProperty=catchAsyncError(
     async (req,res)=>{
         const savedProperties=await savePropertiesModel.find({});
         return res.json({success:true,savedProperties:savedProperties});
     }
)