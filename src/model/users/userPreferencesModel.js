const mongoose = require("mongoose");

const preferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true,
    unique: true
  },
  cities: [{
    type: String,
    trim: true
  }],
  auctionTypes: [{
    type: String,
    // enum: ['bank-owned', '2nd-chance', 'short-sale', 'foreclosure-trustee', 'non-bank-owned']
  }],
  occupancyStatus: [String],
  propertyTypes: {
    residential: {
      selected: {
        type: Boolean,
        default: false
      },
      subTypes: [{
        type: String,
        enum: [
          'Single Family',
          'Multi Family',
          'Condo/Townhouse',
          'Duplex/Triplex/Fourplex',
          'Manufactured/Mobile Homes',
          'Other'
        ]
      }]
    },
    commercial: {
      type: Boolean,
      default: false
    },
    land: {
      type: Boolean,
      default: false
    }
  },
  priceRange: {
    min: {
      type: String,
      default: ''
    },
    max: {
      type: String,
      default: ''
    }
  },
  bedrooms: {
    type: String,
    default: 'Any'
  },
  bathrooms: {
    type: String,
    default: 'Any'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
preferencesSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("UserPreference", preferencesSchema);