const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true
  },
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "productModel",
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  mobilePhone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: null
  },
  // buyerInfo: {
  //   firstName: {
  //     type: String,
  //     required: true
  //   },
  //   lastName: {
  //     type: String,
  //     required: true
  //   },
  //   mobilePhone: {
  //     type: String,
  //     required: true
  //   },
  //   email: {
  //     type: String,
  //     required: true
  //   },
  //   address: {
  //     type: String,
  //     required: true
  //   },
  //   city: {
  //     type: String,
  //     required: true
  //   },
  //   state: {
  //     type: String,
  //     required: true
  //   },
  //   zipCode: {
  //     type: String,
  //     required: true
  //   }
  // },
  // buyerType: {
  //   type: String,
  //   enum: ["individual", "company"],
  //   required: true
  // },
  // companyInfo: {
  //   company: String,
  //   entityType: String,
  //   taxId: String
  // },
  // legalAgreements: {
  //   agreeToTerms: {
  //     type: Boolean,
  //     default: false
  //   },
  //   acknowledgeInspection: {
  //     type: Boolean,
  //     default: false
  //   },
  //   understandFinancing: {
  //     type: Boolean,
  //     default: false
  //   },
  //   acceptPropertyCondition: {
  //     type: Boolean,
  //     default: false
  //   },
  //   acknowledgeClosingTimeline: {
  //     type: Boolean,
  //     default: false
  //   },
  //   agreeToContract: {
  //     type: Boolean,
  //     default: false
  //   },
  //   agreeToDeposit: {
  //     type: Boolean,
  //     default: false
  //   },
  //   acceptTerms: {
  //     type: Boolean,
  //     default: false
  //   }
  // },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  // bidAmount: {
  //   type: Number,
  //   required: true
  // },
  // buyersPremium: {
  //   type: Number,
  //   required: true
  // },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("AuctionRegistration", registrationSchema);