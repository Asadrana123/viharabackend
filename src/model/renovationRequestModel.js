const mongoose = require("mongoose");

const renovationRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true
  },

  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "productModel",
    required: true
  },

  renovationData: {
    primaryArea: {
      type: String,
      enum: ['Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Full Property', 'Exterior'],
      required: true
    },
    style: String,
    colorScheme: String,
    openConcept: Boolean,
    countertopPreference: String,
    luxuryLevel: String,
    spaFeatures: Boolean,
    bathroomType: String,
    layoutFocus: String,
    flooringPreference: String,
    bedroomType: String,
    lightingPreference: String,
    roomPurpose: String,
    accentWall: Boolean,
    colorSchemeStrategy: String,
    focusAreas: String,
    renovationType: String,
    exteriorFocusAreas: String,
    architecturalElements: String,
    includeLandscaping: Boolean,
    budgetTier: {
      type: String,
      enum: ['Budget-Friendly', 'Mid-Range', 'Premium', 'Luxury'],
      required: true
    },
    includeFurniture: Boolean,
    imageQuality: String
  },

  costAnalysis: {
    finalCost: Number,
    costRange: {
      min: Number,
      max: Number
    },
    breakdown: {
      basePerSqFt: Number,
      areaSquareFootage: Number,
      tier: String,
      location: String
    },
    marketContext: {
      state: String,
      city: String,
      message: String
    },
    roiEstimate: {
      estimatedValueIncrease: Number,
      recoveryPercentage: Number
    }
  },

  imageUrls: {
    before: String,
    after: String
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },

  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("renovationRequest", renovationRequestSchema);
