// model/landingPageLeadModel.js
const mongoose = require('mongoose');

const landingPageLeadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      unique:true,
      lowercase: true,
      sparse: true, // allows multiple docs with no email (null/undefined)
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      unique: true,
    },
  },
  { timestamps: true }
);

// Unique email only when provided
landingPageLeadSchema.index({ email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('LandingPageLead', landingPageLeadSchema);