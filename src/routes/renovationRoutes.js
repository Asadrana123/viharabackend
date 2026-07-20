const express = require("express");
const router = express.Router();
const {
  generateRenovationImages,
  getRenovationRequest,
  getContractors,
  saveRenovation,
  deleteRenovation,
  getSavedRenovations
} = require("../controller/renovationController");
const catchAsyncError = require("../middleware/catchAsyncError");
const { isAuthenticated, optionalAuth } = require("../middleware/auth");


/**
 * POST /api/property-renovation/generate-renovation-images
 * Generate renovation visualization images (public; associates userId if logged in)
 */
router.post(
  "/generate-renovation-images",
  optionalAuth,
  catchAsyncError(generateRenovationImages)
);

/**
 * GET /api/property-renovation/saved-renovations
 * Dashboard list — logged-in only.
 * NOTE: declared before ":requestId" so it isn't captured as a param.
 */
router.get(
  "/saved-renovations",
  isAuthenticated,
  catchAsyncError(getSavedRenovations)
);

/**
 * GET /api/property-renovation/renovation-request/:requestId
 * Status + results (public — polling must work for anonymous users)
 */
router.get(
  "/renovation-request/:requestId",
  optionalAuth,
  catchAsyncError(getRenovationRequest)
);

/**
 * POST /api/property-renovation/renovation-request/:requestId/save
 */
router.post(
  "/renovation-request/:requestId/save",
  optionalAuth,
  catchAsyncError(saveRenovation)
);

/**
 * DELETE /api/property-renovation/renovation-request/:requestId
 */
router.delete(
  "/renovation-request/:requestId",
  optionalAuth,
  catchAsyncError(deleteRenovation)
);

router.get('/contractors/:propertyId', optionalAuth, catchAsyncError(getContractors));

module.exports = router;