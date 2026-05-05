const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const {
  CreateAdmin,
  updateUserRole,
  deleteUser,
  getAllUsers,
  getAuctionBids,
  updateAuctionDates,
  updateAuctionStatus
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

// Auction bids route
router.get(
  "/auction/:auctionId/bids",
  isAuthenticated,
  authorizeRoles("admin"),
  getAuctionBids
);


router.put('/auction/:auctionId/dates',
  isAuthenticated,
  authorizeRoles("admin"),
  updateAuctionDates
);

router.put('/auction/:auctionId/status',
  isAuthenticated,
  authorizeRoles("admin"),
  updateAuctionStatus);


module.exports = router;
