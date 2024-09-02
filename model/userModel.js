const mongoose=require("mongoose");
const validator=require("validator");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const userSchema=new mongoose.Schema({
      name:{
           type:String,
           required:[true,"Please Enter User Name"],
           maxLength:[30,"Name cannot exceed 30 characters"],
           minLength:[4,"Name should have more than 4 characters"],
      },
      last_name:{
        type:String,
        required:[true,"Please Enter Last Name"]
      },
      email:{
        type:String,
        required:[true,"Please Enter User Email"],
        unique:true,
        validate:[validator.isEmail,"Please Enter Valid Email"]
      },
      password:{
        type:String,
        // required:[true,"Please Enter Password"],
        minLength:[8,"password should have more than 8 characters"],
        select:false
      },
      businessPhone :{
         type:String,
        //  required:[true,"Please Enter Phone number"],
      },
      createdAt:{
        type:Date,
        default:Date.now
      },
      email_verified_at:{
            type:Date,
            default:null
      },
      remmember_token:{
        type:String,
        default:null
      },
      updated_at:{
        type:Date,
        default:Date.now
      },
      deleted_at:{
             type:Date,
             default:null
      },
      active:{
        type:Number,
        default:1
      },
      savedProperties:[
         {
           type:mongoose.Schema.Types.ObjectId,
           ref:"productModel",
         }
      ],
      resetPasswordToken: String,
      resetPasswordExpire: Date
})
userSchema.pre("save",async function(next){
     if(this.isModified("password")==false){
         next();
     }
     this.updatedAt = Date.now();
     this.password= await bcrypt.hash(this.password, 10);
})
userSchema.methods.comparePassword = async function (enterdPassword) {
  return await bcrypt.compare(enterdPassword, this.password);
};
userSchema.methods.getJWTToken=function (){
      return jwt.sign({id:this._id},process.env.secret,{expiresIn:process.env.expireTime});
}
// In Express.js, the "crypto" module is a built-in module that provides 
// cryptographic functionality, allowing you to perform various cryptographic operations, 
// such as hashing, encryption, and decryption. Here's a simplified explanation of 
// how the crypto module works in Express.js:
// const dataToHash = 'Hello, World!';
// const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
// console.log('Hash:', hash);
// In this example, we create a SHA-256 hash of the string 'Hello, World!'. 
//The update method specifies the data to be hashed, and digest('hex') converts the hash into a
// hexadecimal string.
userSchema.methods.getResetPasswordToken=function (){
  //genratingtoken
  const resetToken=require('crypto').randomBytes(20).toString('hex')
  //hashing token and adding to userScheme
  this.resetPasswordToken=require("crypto").createHash("sha256").update(resetToken).digest("hex")
  this.resetPasswordExpire=Date.now()+15*60*1000;

  return resetToken;
  }
module.exports=mongoose.model("userModel",userSchema);