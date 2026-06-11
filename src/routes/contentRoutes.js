const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const {
  createPost,
  getAllPosts,
  getPost,
  updatePost,
  submitForReview,
  approvePost,
  rejectPost,
  schedulePost,
  markPublished,
  deletePost,
  getStats,
  generatePost,
  generateVisual,
} = require("../controller/contentController");

// All routes require authentication + admin role
router.use(isAuthenticated, authorizeRoles("admin"));

// Stats
router.get("/stats", getStats);

// AI Generate
router.post("/generate", generatePost);
router.post("/:id/generate-visual", generateVisual);

// CRUD
router.post("/", createPost);
router.get("/", getAllPosts);
router.get("/:id", getPost);
router.put("/:id", updatePost);
router.delete("/:id", deletePost);

// Workflow transitions
router.patch("/:id/submit", submitForReview);
router.patch("/:id/approve", approvePost);
router.patch("/:id/reject", rejectPost);
router.patch("/:id/schedule", schedulePost);
router.patch("/:id/publish", markPublished);

module.exports = router;