const mongoose=require("mongoose");
const savePropertiesSchema=new mongoose.Schema({
      user_id:{
           type:String,
           required:true,
      },
      product_id:{
        type:String,
        required:true,
      },
      status:{
        type:Number,
        default:1,
      },
      createdAt:{
        type:Date,
        default:Date.now
      },
      updated_at:{
        type:Date,
        default:Date.now
      }
})
savePropertiesSchema.pre('save',async function(next){
           this.updated_at=Date.now();
           next();
} )
module.exports=mongoose.model("savePropertiesModel",savePropertiesSchema);