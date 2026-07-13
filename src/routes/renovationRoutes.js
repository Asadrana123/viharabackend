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
const { isAuthenticated } = require("../middleware/auth");


/**
 * POST /api/property-renovation/generate-renovation-images
 * Generate renovation visualization images
 */
router.post(
  "/generate-renovation-images",
  isAuthenticated,
  catchAsyncError(generateRenovationImages)
);

/**
 * GET /api/property-renovation/saved-renovations
 * List the current user's saved renovations (dashboard).
 * NOTE: declared before the ":requestId" route so "saved-renovations"
 * is not captured as a requestId param.
 */
router.get(
  "/saved-renovations",
  isAuthenticated,
  catchAsyncError(getSavedRenovations)
);

/**
 * GET /api/property-renovation/renovation-request/:requestId
 * Get renovation request status and results
 */
router.get(
  "/renovation-request/:requestId",
  isAuthenticated,
  catchAsyncError(getRenovationRequest)
);

/**
 * POST /api/property-renovation/renovation-request/:requestId/save
 * Save a completed renovation to the user's dashboard.
 */
router.post(
  "/renovation-request/:requestId/save",
  isAuthenticated,
  catchAsyncError(saveRenovation)
);

/**
 * DELETE /api/property-renovation/renovation-request/:requestId
 * Discard a renovation (user chose not to keep it).
 */
router.delete(
  "/renovation-request/:requestId",
  isAuthenticated,
  catchAsyncError(deleteRenovation)
);

router.get('/contractors/:propertyId', isAuthenticated, catchAsyncError(getContractors));

module.exports = router;
