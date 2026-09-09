const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const {
  CreateAdmin,
  updateUserRole,
  deleteUser,
  getAllUsers,
  getAuctionBids,
  updateAuctionDates,
  updateAuctionStatus,
  updateAuctionStartBid,
  getAuctionsWithSellers,
  assignSeller,
  unassignSeller
} = require("../controller/adminController");
const {
  getAllRegistrations,
  updateRegistrationStatus,
} = require("../controller/auctionRegistrationController");
const {
  adminGetRealtors,
  adminGetRealtor,
  adminUpdateRealtorStatus,
  adminAssignProperty,
  adminUnassignProperty,
  adminGetPropertyRequests,
  adminReviewPropertyRequest,
  adminGetRealtorRegistrations
} = require("../controller/realtorController");

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
router.put(
  "/auction/:auctionId/start-bid",
  isAuthenticated,
  authorizeRoles("admin"),
  updateAuctionStartBid
);

// Seller assignment routes
router.get(
  "/auctions-with-sellers",
  isAuthenticated,
  authorizeRoles("admin"),
  getAuctionsWithSellers
);

router.put(
  "/auction/:auctionId/seller",
  isAuthenticated,
  authorizeRoles("admin"),
  assignSeller
);

router.delete(
  "/auction/:auctionId/seller",
  isAuthenticated,
  authorizeRoles("admin"),
  unassignSeller
);

// ============================================================================
// Realtor affiliate management routes (Req 1, Req 3, Req 11)
// ============================================================================
router.get(
  "/realtors",
  isAuthenticated,
  authorizeRoles("admin"),
  adminGetRealtors
);

router.get(
  "/realtor/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  adminGetRealtor
);

router.get(
  "/realtor/:id/registrations",
  isAuthenticated,
  authorizeRoles("admin"),
  adminGetRealtorRegistrations
);

router.put(
  "/realtor/:id/status",
  isAuthenticated,
  authorizeRoles("admin"),
  adminUpdateRealtorStatus
);

router.put(
  "/realtor/:id/property",
  isAuthenticated,
  authorizeRoles("admin"),
  adminAssignProperty
);

router.delete(
  "/realtor/:id/property",
  isAuthenticated,
  authorizeRoles("admin"),
  adminUnassignProperty
);

// Realtor property requests
router.get(
  "/realtor-requests",
  isAuthenticated,
  authorizeRoles("admin"),
  adminGetPropertyRequests
);

router.put(
  "/realtor-request/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  adminReviewPropertyRequest
);

module.exports = router;
