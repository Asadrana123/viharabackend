const express = require("express");
const { CreateAdmin, LogOut, Login } = require("../controller/adminController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const {
  getAllRegistrations,
  updateRegistrationStatus,
} = require("../controller/auctionRegistrationController");
const router = express.Router();
router.post(
  "/register",
  isAuthenticated,
  CreateAdmin
);
router.post("/login",Login);
router.get("/logout", LogOut);
router.get(
  "/auction-registrations",
  isAuthenticated,
  getAllRegistrations
);
router.put(
  "/auction-registration/:id",
  isAuthenticated,
  updateRegistrationStatus
);

module.exports = router;
