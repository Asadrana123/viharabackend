const mongoose = require("mongoose");
const {
  ROLE_LABELS,
  isTechnicalRole,
  isMarketingRole,
  isPortfolioRequired,
} = require("../../config/careerRoles");

const careerApplicationSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: Object.keys(ROLE_LABELS),
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
      required: [
        function () { return isPortfolioRequired(this.role); },
        "Portfolio link is required",
      ],
    },
    resumeLink: {
      type: String,
      required: [true, "Resume link is required"],
      trim: true,
    },
    // Common questions
    technicalSkills: {
      type: String,
      required: [
        function () { return isTechnicalRole(this.role); },
        "Technical skills is required",
      ],
    },
    mernAndFigmaRating: {
      type: String,
      required: [
        function () { return isTechnicalRole(this.role); },
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
    comfortableSchedule: {
      type: String,
      required: [true, "Schedule answer is required"],
    },
    joinImmediately: {
      type: String,
      required: [true, "Joining answer is required"],
    },
    // Marketing roles only (see MARKETING_ROLES in config/careerRoles.js)
    successfulCampaign: {
      type: String,
      default: "",
      required: [
        function () { return isMarketingRole(this.role); },
        "Successful campaign answer is required",
      ],
    },
    creativeGrowthStrategy: {
      type: String,
      default: "",
      required: [
        function () { return isMarketingRole(this.role); },
        "Creative growth strategy answer is required",
      ],
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