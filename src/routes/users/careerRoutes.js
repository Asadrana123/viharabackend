const express = require("express");
const {
  submitApplication,
  getAllApplications,
  getApplication,
  updateApplicationStatus,
} = require("../../controller/users/careerController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");

const router = express.Router();

// Public
router.post("/apply", formRateLimit({ name: "career-apply" }), verifyRecaptcha, submitApplication);

// Admin only
router.get(
  "/",
  isAuthenticated,
  authorizeRoles("admin"),
  getAllApplications
);

router.get(
  "/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  getApplication
);

router.put(
  "/:id/status",
  isAuthenticated,
  authorizeRoles("admin"),
  updateApplicationStatus
);

module.exports = router;
