const express = require("express");
const { 
  submitAuctionRegistration, 
  getRegistrationStatus,  
  getUserRegistrations
} = require("../controller/auctionRegistrationController");
const { isAuthenticated} = require("../middleware/auth");

const router = express.Router();

// User routes
router.post("/", isAuthenticated,submitAuctionRegistration);
router.get("/status", isAuthenticated,getRegistrationStatus);
router.get("/user/registrations", isAuthenticated, getUserRegistrations);


module.exports = router;