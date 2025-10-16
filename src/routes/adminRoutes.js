const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const { 
  CreateAdmin, 
  updateUserRole,
  deleteUser,
  getAllUsers
} = require("../controller/adminController");
const {
  getAllRegistrations,
  updateRegistrationStatus,
} = require("../controller/auctionRegistrationController");

const router = express.Router();

// Admin user management routes
router.get(
  "/users",
  isAuthenticated,
  authorizeRoles("admin"),
  getAllUsers
);

router.post(
  "/register-admin",
  isAuthenticated,
  authorizeRoles("admin"),
  CreateAdmin
);

router.put(
  "/user/:id/role",
  isAuthenticated,
  authorizeRoles("admin"),
  updateUserRole
);

router.delete(
  "/user/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  deleteUser
);

// Auction registration routes
router.get(
  "/auction-registrations",
  isAuthenticated,
  authorizeRoles("admin"),
  getAllRegistrations
);

router.put(
  "/auction-registration/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  updateRegistrationStatus
);

module.exports = router;