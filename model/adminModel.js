const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken")
const adminSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    password: {
        type: String,
        required: true,
    }
});

// Middleware to update the updatedAt field on save
adminSchema.pre("save",async function(next){
    if(this.isModified("password")==false){
        next();
    }
    this.updatedAt = Date.now();
    this.password= await bcrypt.hash(this.password, 10);
})
adminSchema.methods.comparePassword = async function (enterdPassword) {
 return await bcrypt.compare(enterdPassword, this.password);
};
adminSchema.methods.getJWTToken=function (){
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
adminSchema.methods.getResetPasswordToken=function (){
 //genratingtoken
 const resetToken=require('crypto').randomBytes(20).toString('hex')
 //hashing token and adding to userScheme
 this.resetPasswordToken=require("crypto").createHash("sha256").update(resetToken).digest("hex")
 this.resetPasswordExpire=Date.now()+15*60*1000;

 return resetToken;
 }
const adminModel = mongoose.model('adminModel', adminSchema);

module.exports = adminModel;
