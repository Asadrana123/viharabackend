const ContentPost = require("../model/contentPostModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");

const axios = require("axios");

const SYSTEM_PROMPT = `You are the LinkedIn content writer for Vihara, a US real estate auction platform.

BRAND: Professional, data-driven, credible. Website: vihara.ai

POST RULES:
- 150-300 words
- First line = strong hook (stat, contrast, prediction, or challenge)
- Cite every data source inline (e.g. "per NAR", "ATTOM data shows")
- One CTA at the end only
- 3-5 hashtags: #USHousingMarket #RealEstateInvesting #Vihara #PropTech #DistressedAssets
- Never start with "I am happy to share"
- Professional, not salesy
- No predictions stated as facts - use "suggests", "indicates", "points to"

RESPONSE FORMAT - return ONLY valid JSON, nothing else:
{
  "hookLine": "The first 1-2 sentences only",
  "postText": "Full post text including hook, body, CTA, and hashtags",
  "ctaUsed": "The exact CTA line used",
  "hashtags": ["tag1","tag2","tag3"],
  "dataPoints": [
    { "stat": "the stat used", "source": "named source", "date": "approx date/month" }
  ],
  "visualType": "one of: stat-card | bar-chart | line-chart | split-graphic | carousel | video-walkthrough | avatar-video | stat-video | marketing-video",
  "visualBrief": "2-3 punchy lines for the graphic. Include the key number prominently."
}`;

// ─── HELPERS ────────────────────────────────────────────────────────────────

// Calls Anthropic API and returns the first text block
async function callClaude({ system, messages, tools }) {
  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system,
    messages,
  };
  if (tools) body.tools = tools;

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    }
  );

  const textBlock = response.data.content?.filter((b) => b.type === "text").pop();
  if (!textBlock) throw new Error("No text returned from Claude");
  return textBlock.text;
}

// Pulls the first complete {...} JSON object out of any string
function extractJSON(text) {
  // Strip markdown fences first
  const stripped = text.replace(/```json|```/g, "").trim();

  // Try direct parse first (happy path)
  try { return JSON.parse(stripped); } catch {}

  // Find the first { and last } and try that substring
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(stripped.slice(start, end + 1));
  }

  throw new Error("No JSON object found in response");
}

// Runs quality checks on a parsed post object
// Returns { passed: bool, issues: string[] }
function checkPost(parsed) {
  const issues = [];

  const wordCount = parsed.postText
    ? parsed.postText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  if (wordCount < 150) issues.push(`Word count is ${wordCount} — must be at least 150`);
  if (wordCount > 300) issues.push(`Word count is ${wordCount} — must be 300 or fewer`);

  if (!parsed.hookLine || parsed.hookLine.trim().length < 10)
    issues.push("hookLine is missing or too short");

  if (!parsed.ctaUsed || parsed.ctaUsed.trim().length < 5)
    issues.push("ctaUsed (call to action) is missing");

  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  if (hashtags.length < 3) issues.push(`Only ${hashtags.length} hashtag(s) — need at least 3`);
  if (hashtags.length > 5) issues.push(`${hashtags.length} hashtags — maximum is 5`);

  const dataPoints = Array.isArray(parsed.dataPoints) ? parsed.dataPoints : [];
  const hasSource = dataPoints.some((dp) => dp.source && dp.source.trim().length > 0);
  if (!hasSource) issues.push("No data point has a named source");

  if (parsed.postText && parsed.postText.trim().toLowerCase().startsWith("i am happy to share"))
    issues.push('Post must not start with "I am happy to share"');

  return { passed: issues.length === 0, issues };
}

// --- AI GENERATE POST (with verification loop) ------------------------------
exports.generatePost = catchAsyncError(async (req, res, next) => {
  const { topic, pillar } = req.body;

  if (!topic || !pillar) {
    return next(new Errorhandler("topic and pillar are required", 400));
  }

  const userMessage = `Write a LinkedIn post for Vihara.\n\nPILLAR: ${pillar}\nTOPIC: ${topic}\n\nSearch for the most recent real data from Zillow, Redfin, NAR, FRED, ATTOM, or Census Bureau to back this post. Use real stats with named sources. Data must be from the last 60 days where possible.\n\nReturn ONLY the JSON object specified.`;

  // ── Pass 1: generate the post ──────────────────────────────────────────
  const raw1 = await callClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });

  let parsed;
  try {
    parsed = extractJSON(raw1);
  } catch {
    return next(new Errorhandler("AI returned invalid JSON on first pass", 500));
  }

  // ── Verification: check the post against brand rules ──────────────────
  const { passed, issues } = checkPost(parsed);

  if (!passed) {
    // ── Pass 2: fix the issues ──────────────────────────────────────────
    const fixMessage = `The LinkedIn post you wrote has the following problems:\n\n${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}\n\nHere is the post to fix:\n${JSON.stringify(parsed, null, 2)}\n\nFix every problem listed above. Keep the same topic and data. Return ONLY the corrected JSON object — no explanation, no markdown.`;

    const raw2 = await callClaude({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: fixMessage }],
    });

    try {
      parsed = extractJSON(raw2);
    } catch {
      // Pass 2 JSON parse failed — return pass 1 result rather than crashing
      console.warn("[ContentController] Pass 2 JSON parse failed, returning pass 1 result");
    }
  }

  res.status(200).json({
    success: true,
    result: parsed,
    // These two fields are for debugging — visible in your backend logs
    _verification: { passed, issues },
  });
});


// ─── CREATE (save draft) ────────────────────────────────────────────────────
exports.createPost = catchAsyncError(async (req, res, next) => {
  const {
    topic,
    pillar,
    postText,
    hookLine,
    hashtags,
    ctaUsed,
    dataPoints,
    visualType,
    visualBrief,
    generatedImageUrl,
    generatedVideoUrl,
    higgsfield_job_id,
    scheduledFor,
    factCheckPassed,
  } = req.body;

  const post = await ContentPost.create({
    topic,
    pillar,
    postText: postText || "",
    hookLine: hookLine || "",
    hashtags: hashtags || [],
    ctaUsed: ctaUsed || "",
    dataPoints: dataPoints || [],
    visualType: visualType || "",
    visualBrief: visualBrief || "",
    generatedImageUrl: generatedImageUrl || "",
    generatedVideoUrl: generatedVideoUrl || "",
    higgsfield_job_id: higgsfield_job_id || "",
    scheduledFor: scheduledFor || null,
    factCheckPassed: factCheckPassed || false,
    status: "draft",
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, post });
});

// ─── GET ALL POSTS (with filters) ──────────────────────────────────────────
exports.getAllPosts = catchAsyncError(async (req, res) => {
  const { status, pillar, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status) query.status = status;
  if (pillar) query.pillar = pillar;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await ContentPost.countDocuments(query);

  const posts = await ContentPost.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate("createdBy", "name email")
    .populate("reviewedBy", "name email")
    .lean();

  res.status(200).json({
    success: true,
    posts,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// ─── GET SINGLE POST ────────────────────────────────────────────────────────
exports.getPost = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id)
    .populate("createdBy", "name email")
    .populate("reviewedBy", "name email");

  if (!post) return next(new Errorhandler("Post not found", 404));

  res.status(200).json({ success: true, post });
});

// ─── UPDATE POST ────────────────────────────────────────────────────────────
exports.updatePost = catchAsyncError(async (req, res, next) => {
  let post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  // Don't allow editing published posts
  if (post.status === "published") {
    return next(new Errorhandler("Cannot edit a published post", 400));
  }

  const allowedFields = [
    "topic", "pillar", "postText", "hookLine", "hashtags",
    "ctaUsed", "dataPoints", "visualType", "visualBrief",
    "generatedImageUrl", "generatedVideoUrl", "higgsfield_job_id",
    "scheduledFor", "factCheckPassed", "status",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) post[field] = req.body[field];
  });

  await post.save();
  res.status(200).json({ success: true, post });
});

// ─── SUBMIT FOR REVIEW ──────────────────────────────────────────────────────
exports.submitForReview = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  if (post.status !== "draft") {
    return next(new Errorhandler("Only drafts can be submitted for review", 400));
  }

  // Basic validation before submission
  if (!post.postText || post.wordCount < 50) {
    return next(new Errorhandler("Post text is too short to submit", 400));
  }
  if (!post.dataPoints || post.dataPoints.length === 0) {
    return next(new Errorhandler("At least one data point with a source is required", 400));
  }

  post.status = "pending_review";
  await post.save();

  res.status(200).json({ success: true, message: "Post submitted for senior review", post });
});

// ─── APPROVE POST ───────────────────────────────────────────────────────────
exports.approvePost = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  if (post.status !== "pending_review") {
    return next(new Errorhandler("Post is not pending review", 400));
  }

  post.status = "approved";
  post.reviewedBy = req.user._id;
  post.reviewedAt = new Date();
  post.reviewNotes = req.body.notes || "";
  await post.save();

  res.status(200).json({ success: true, message: "Post approved", post });
});

// ─── REJECT POST ────────────────────────────────────────────────────────────
exports.rejectPost = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  if (post.status !== "pending_review") {
    return next(new Errorhandler("Post is not pending review", 400));
  }
  if (!req.body.notes) {
    return next(new Errorhandler("Rejection reason (notes) is required", 400));
  }

  post.status = "rejected";
  post.reviewedBy = req.user._id;
  post.reviewedAt = new Date();
  post.reviewNotes = req.body.notes;
  await post.save();

  res.status(200).json({ success: true, message: "Post rejected with feedback", post });
});

// ─── SCHEDULE POST ──────────────────────────────────────────────────────────
exports.schedulePost = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  if (post.status !== "approved") {
    return next(new Errorhandler("Only approved posts can be scheduled", 400));
  }
  if (!req.body.scheduledFor) {
    return next(new Errorhandler("scheduledFor date is required", 400));
  }

  post.status = "scheduled";
  post.scheduledFor = new Date(req.body.scheduledFor);
  await post.save();

  res.status(200).json({ success: true, message: "Post scheduled", post });
});

// ─── MARK PUBLISHED ─────────────────────────────────────────────────────────
exports.markPublished = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  post.status = "published";
  post.publishedAt = new Date();
  await post.save();

  res.status(200).json({ success: true, message: "Post marked as published", post });
});

// ─── DELETE POST ────────────────────────────────────────────────────────────
exports.deletePost = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  if (post.status === "published") {
    return next(new Errorhandler("Cannot delete a published post", 400));
  }

  await post.deleteOne();
  res.status(200).json({ success: true, message: "Post deleted" });
});

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────
exports.getStats = catchAsyncError(async (req, res) => {
  const [total, draft, pending, approved, scheduled, published, rejected] =
    await Promise.all([
      ContentPost.countDocuments(),
      ContentPost.countDocuments({ status: "draft" }),
      ContentPost.countDocuments({ status: "pending_review" }),
      ContentPost.countDocuments({ status: "approved" }),
      ContentPost.countDocuments({ status: "scheduled" }),
      ContentPost.countDocuments({ status: "published" }),
      ContentPost.countDocuments({ status: "rejected" }),
    ]);

  // Posts per pillar
  const pillarBreakdown = await ContentPost.aggregate([
    { $group: { _id: "$pillar", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Recent activity (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCount = await ContentPost.countDocuments({ createdAt: { $gte: weekAgo } });

  res.status(200).json({
    success: true,
    stats: {
      total, draft, pending_review: pending, approved,
      scheduled, published, rejected, recentThisWeek: recentCount,
      pillarBreakdown,
    },
  });
});

// ─── GENERATE VISUAL (Higgsfield) ────────────────────────────────────────────
exports.generateVisual = catchAsyncError(async (req, res, next) => {
  const post = await ContentPost.findById(req.params.id);
  if (!post) return next(new Errorhandler("Post not found", 404));

  if (!post.visualBrief) {
    return next(new Errorhandler("Visual brief is required before generating an image", 400));
  }

  const { generateLinkedInGraphic } = require("../services/higgsfieldService");
  const imageUrl = await generateLinkedInGraphic(
    post.visualBrief,
    post.pillar,
    post.dataPoints,
    post.postText,
    post.hookLine,
    post.visualType,  // ← add
    post.topic        // ← add
  );
  post.generatedImageUrl = imageUrl;
  await post.save();

  res.status(200).json({ success: true, imageUrl, post });
});