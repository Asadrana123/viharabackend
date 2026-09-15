const mongoose = require("mongoose");

const contentPostSchema = new mongoose.Schema({
  // Core content
  topic: {
    type: String,
    required: [true, "Topic is required"],
    trim: true,
  },
  pillar: {
    type: String,
    enum: [
      "Market Pulse",
      "Distressed Asset Trends",
      "Investor Intelligence",
      "Myth Busting",
      "Vihara Property Spotlight",
      "Tailwind Stories",
      "Headwind Stories",
      "Where the Market Is Going",
      "Data Storytelling Deep Dives",
    ],
    required: true,
  },

  // Generated post content
  postText: {
    type: String,
    default: "",
  },
  hookLine: {
    type: String,
    default: "",
  },
  hashtags: {
    type: [String],
    default: [],
  },
  ctaUsed: {
    type: String,
    default: "",
  },
  dataPoints: [
    {
      stat: String,
      source: String,
      date: String,
    },
  ],

  // Visual
  visualType: {
    type: String,
    enum: [
      "stat-card",
      "bar-chart",
      "line-chart",
      "split-graphic",
      "carousel",
      "video-walkthrough",
      "avatar-video",
      "stat-video",
      "marketing-video",
      "",
    ],
    default: "",
  },
  visualBrief: {
    type: String,
    default: "",
  },
  generatedImageUrl: {
    type: String,
    default: "",
  },
  generatedVideoUrl: {
    type: String,
    default: "",
  },
  higgsfield_job_id: {
    type: String,
    default: "",
  },

  // Workflow status
  status: {
    type: String,
    enum: ["draft", "pending_review", "approved", "rejected", "scheduled", "published"],
    default: "draft",
  },

  // Review
  reviewNotes: {
    type: String,
    default: "",
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },

  // Scheduling
  scheduledFor: {
    type: Date,
    default: null,
  },
  publishedAt: {
    type: Date,
    default: null,
  },

  // Meta
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true,
  },
  wordCount: {
    type: Number,
    default: 0,
  },
  factCheckPassed: {
    type: Boolean,
    default: false,
  },
},
{
  timestamps: true,
});

// Auto-calculate word count before save
contentPostSchema.pre("save", function (next) {
  if (this.postText) {
    this.wordCount = this.postText.trim().split(/\s+/).filter(Boolean).length;
  }
  next();
});

module.exports = mongoose.model("contentPost", contentPostSchema);
