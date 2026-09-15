const mongoose = require("mongoose");

// A realtor's request to have a property added to their showcase (Req: realtor
// can request any property; admin approves -> property is assigned to them).
// One row per realtor+property pair; status transitions pending -> approved /
// declined, and a declined row can be reopened to pending on re-request.
const propertyRequestSchema = new mongoose.Schema({
  realtorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "realtorModel",
    required: true,
    index: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "productModel",
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ["pending", "approved", "declined"],
    default: "pending",
    index: true
  },
  // Optional admin note recorded on approve/decline.
  note: {
    type: String,
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
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

// One request row per realtor+property (re-requesting reuses the same row).
propertyRequestSchema.index({ realtorId: 1, propertyId: 1 }, { unique: true });

propertyRequestSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("propertyRequestModel", propertyRequestSchema);
