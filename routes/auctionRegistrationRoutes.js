const express = require("express");
const { 
  submitAuctionRegistration, 
  getRegistrationStatus,  
} = require("../controller/auctionRegistrationController");
const { isAuthenticated} = require("../middleware/auth");

const router = express.Router();

// User routes
router.post("/", isAuthenticated,submitAuctionRegistration);
router.get("/status", isAuthenticated,getRegistrationStatus);

// Admin routes

module.exports = router;