const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema({
  userType: {
    type: String,
    enum: ['Buyer', 'Agent'], 
    default: 'Buyer'
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  name: {
    type: String,
    required: [true, "Please Enter User Name"],
    maxLength: [30, "Name cannot exceed 30 characters"],
    minLength: [2, "Name should have more than 4 characters"],
  },
  last_name: {
    type: String,
    required: [true, "Please Enter Last Name"]
  },
  email: {
    type: String,
    required: [true, "Please Enter User Email"],
    unique: true,
    validate: [validator.isEmail, "Please Enter Valid Email"]
  },
  password: {
    type: String,
    required: [true, "Please Enter Password"],
    minLength: [8, "password should have more than 8 characters"],
    select: false
  },
  businessPhone: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  email_verified_at: {
    type: Date,
    default: null
  },
  mobile_verified_at: {
    type: Date,
    default: null,
  },
  remmember_token: {
    type: String,
    default: null
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  deleted_at: {
    type: Date,
    default: null
  },
  active: {
    type: Number,
    default: 1
  },
  city: {
    type: String,
  },
  state: {
    type: String,
  },
  savedProperties: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "productModel",
    }
  ],
  resetPasswordToken: String,
  resetPasswordExpire: Date
});

userSchema.pre("save", async function (next) {
  if (this.isModified("password") == false) {
    next();
  }
  this.updated_at = Date.now();
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.getJWTToken = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.secret, { expiresIn: process.env.expireTime });
};

userSchema.methods.getResetPasswordToken = function () {
  //generating token
  const resetToken = require('crypto').randomBytes(20).toString('hex');
  //hashing token and adding to userSchema
  this.resetPasswordToken = require("crypto").createHash("sha256").update(resetToken).digest("hex");
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model("userModel", userSchema);