const express = require("express");
const {
  applyRealtor,
  loginRealtor,
  logoutRealtor,
  getRealtorMe,
  updateRealtorProfile,
  getShowcase,
  getMyProperties,
  getMyPropertyDetail,
  getRequestableProperties,
  createPropertyRequest,
  getMyRequests,
  sharePropertyLink
} = require("../controller/realtorController");
const {
  createSubmission,
  updateSubmission,
  submitSubmission,
  listMySubmissions,
  getMySubmission,
  deleteSubmission
} = require("../controller/propertySubmissionController");
const { isRealtorAuthenticated, requireApprovedRealtor } = require("../middleware/realtorAuth");

const router = express.Router();

// Public
router.post("/apply", applyRealtor);
router.post("/login", loginRealtor);
router.post("/logout", logoutRealtor);

// Public showcase — the bare vanity URL /:slug fetches this.
router.get("/showcase/:slug", getShowcase);

// Realtor-authenticated. Any logged-in status may reach these; dashboard DATA
// endpoints (Phase 3) additionally use requireApprovedRealtor.
router.get("/me", isRealtorAuthenticated, getRealtorMe);
router.put("/me", isRealtorAuthenticated, updateRealtorProfile);

// Realtor dashboard (approved realtors only) — hard-scoped to the caller.
router.get("/dashboard/properties", isRealtorAuthenticated, requireApprovedRealtor, getMyProperties);
router.get("/dashboard/property/:propertyId", isRealtorAuthenticated, requireApprovedRealtor, getMyPropertyDetail);
router.post("/dashboard/property/:propertyId/share", isRealtorAuthenticated, requireApprovedRealtor, sharePropertyLink);

// Property requests — browse any property, request it, and track your requests.
router.get("/dashboard/browse", isRealtorAuthenticated, requireApprovedRealtor, getRequestableProperties);
router.post("/dashboard/request", isRealtorAuthenticated, requireApprovedRealtor, createPropertyRequest);
router.get("/dashboard/requests", isRealtorAuthenticated, requireApprovedRealtor, getMyRequests);

// ============================================================================
// Property submissions — realtor self-uploads a property that goes through
// admin review before it is published (Realtor Property Upload & Management
// Workflow). All hard-scoped to req.realtor. Static paths first, :id last.
// ============================================================================
router.get("/dashboard/submissions", isRealtorAuthenticated, requireApprovedRealtor, listMySubmissions);
router.post("/dashboard/submissions", isRealtorAuthenticated, requireApprovedRealtor, createSubmission);
router.get("/dashboard/submissions/:id", isRealtorAuthenticated, requireApprovedRealtor, getMySubmission);
router.put("/dashboard/submissions/:id", isRealtorAuthenticated, requireApprovedRealtor, updateSubmission);
router.post("/dashboard/submissions/:id/submit", isRealtorAuthenticated, requireApprovedRealtor, submitSubmission);
router.delete("/dashboard/submissions/:id", isRealtorAuthenticated, requireApprovedRealtor, deleteSubmission);

module.exports = router;
