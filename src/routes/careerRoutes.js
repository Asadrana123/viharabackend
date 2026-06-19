const express = require("express");
const {
  submitApplication,
  getAllApplications,
  getApplication,
  updateApplicationStatus,
} = require("../controller/careerController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

// Public
router.post("/apply", submitApplication);

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
