const express = require("express");
const router = express.Router();
const {
  generateRenovationImages,
  getRenovationRequest
} = require("../controller/renovationController");
const catchAsyncError = require("../middleware/catchAsyncError");
const { isAuthenticated } = require("../middleware/auth");


/**
 * POST /api/property/generate-renovation-images
 * Generate renovation visualization images
 */
router.post(
  "/generate-renovation-images",
   isAuthenticated,
  catchAsyncError(generateRenovationImages)
);

/**
 * GET /api/property/renovation-request/:requestId
 * Get renovation request status and results
 */
router.get(
  "/renovation-request/:requestId",
   isAuthenticated ,
  catchAsyncError(getRenovationRequest)
);

module.exports = router;
