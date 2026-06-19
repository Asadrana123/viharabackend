const mongoose = require("mongoose");

const careerApplicationSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: [
        "senior-software-engineer",
        "product-manager",
        "ui-ux-designer",
        "marketing-manager",
      ],
    },
    // Basic info
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    linkedinUrl: {
      type: String,
      trim: true,
    },
    portfolioUrl: {
      type: String,
      trim: true,
    },
    resumeLink: {
      type: String,
      required: [true, "Resume link is required"],
      trim: true,
    },
    // Common questions (Q1–Q8)
    technicalSkills: {
      type: String,
      required: [
        function () { return this.role !== "marketing-manager"; },
        "Technical skills is required",
      ],
    },
    mernAndFigmaRating: {
      type: String,
      required: [
        function () { return this.role !== "marketing-manager"; },
        "MERN & Figma rating is required",
      ],
    },
    proudProject: {
      type: String,
      required: [true, "Proud project answer is required"],
    },
    freeTimeLearning: {
      type: String,
      required: [true, "Free time learning answer is required"],
    },
    admirePerson: {
      type: String,
      required: [true, "Admire person answer is required"],
    },
    worldClassSkill: {
      type: String,
      required: [true, "World class skill answer is required"],
    },
    controversialOpinion: {
      type: String,
      required: [true, "Controversial opinion is required"],
    },
    currentExpectedCTC: {
      type: String,
      required: [true, "CTC information is required"],
    },
    availableImmediately: {
      type: String,
      enum: ["yes", "no", "notice-period"],
      required: [true, "Availability is required"],
    },
    // Marketing Manager only (Q9–Q10)
    successfulCampaign: {
      type: String,
      default: "",
    },
    creativeGrowthStrategy: {
      type: String,
      default: "",
    },
    // Admin
    status: {
      type: String,
      enum: ["new", "reviewed", "shortlisted", "rejected"],
      default: "new",
    },
    adminNotes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CareerApplication", careerApplicationSchema);