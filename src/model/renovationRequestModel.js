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

  selectedImage: {
    type: String,
    required: true
  },

  renovationData: {
    primaryArea: {
      type: String,
      enum: ['Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Exterior']
    },
    style: String,
    colorScheme: String,
    budgetTier: {
      type: String,
      enum: ['Budget-Friendly', 'Mid-Range', 'Premium', 'Luxury'],
      required: true
    }
  },

  costAnalysis: {
    finalCost: Number,
    costRange: {
      min: Number,
      max: Number
    },
    lineItems: [
      {
        item: String,
        description: String,
        costBasis: String,
        cost: Number,
        costRange: {
          min: Number,
          max: Number
        },
        roiRecovery: Number
      }
    ],
    contingency: {
      percentage: Number,
      amount: Number,
      reason: String
    },
    breakdown: {
      basePerSqFt: Number,
      areaSquareFootage: Number,
      primaryWork: String,
      focusArea: String,
      tier: String,
      location: String,
      subtotal: Number
    },
    marketContext: {
      state: String,
      city: String,
      regionalFactor: Number,
      message: String,
      dataSource: String
    },
    roiEstimate: {
      estimatedValueIncrease: Number,
      recoveryPercentage: Number,
      roiMessage: String,
      source: String
    }
  },

  disclaimer: String,

  imageUrls: {
    before: String,
    after: String
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  description: {
    type: String,
    default: ""
  },

  // Dashboard save marker.
  //   null  -> transient/junk generation, eligible for auto-cleanup after 24h
  //   Date  -> user explicitly saved it; appears on their dashboard, never cleaned
  savedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // createdAt / updatedAt — createdAt drives the 24h cleanup window
});

// Cleanup job queries unsaved, older-than-24h records; index keeps it cheap.
renovationRequestSchema.index({ savedAt: 1, createdAt: 1 });

// Dashboard lists a user's saved renovations, newest first.
renovationRequestSchema.index({ userId: 1, savedAt: -1 });

module.exports = mongoose.model("renovationRequest", renovationRequestSchema);