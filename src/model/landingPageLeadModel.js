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
      unique: true,
      lowercase: true,
      sparse: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      unique: true,
    },
    utm_source: { type: String, trim: true, default: null },
    utm_medium: { type: String, trim: true, default: null },
    utm_campaign: { type: String, trim: true, default: null },
    utm_content: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

landingPageLeadSchema.index({ email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('LandingPageLead', landingPageLeadSchema);