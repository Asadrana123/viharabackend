// model/ebookRequestModel.js
const mongoose = require("mongoose");

const ebookRequestSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    trim: true
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
});

// Create an index on email to improve query performance
ebookRequestSchema.index({ email: 1 });

module.exports = mongoose.model("EbookRequest", ebookRequestSchema);