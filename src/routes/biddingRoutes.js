// routes/bidding.routes.js
const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const manualBiddingController = require("../controller/manualBiddingController");
const autoBiddingController = require("../controller/autoBiddingController");

// Auction access check
router.get("/auction/check-access/:id", isAuthenticated, manualBiddingController.checkAuctionAccess);

// Manual bidding routes
router.post("/manual-bid", isAuthenticated, manualBiddingController.createManualBid);
router.get("/manual-bid/history/:auctionId", isAuthenticated, manualBiddingController.getBidHistory);
router.get("/manual-bid/user-history", isAuthenticated, manualBiddingController.getUserBidHistory);

// Auto bidding routes
router.post("/auto-bidding/settings", isAuthenticated, autoBiddingController.saveAutoBiddingSettings);
router.get("/auto-bidding/settings/:id", isAuthenticated, autoBiddingController.getAutoBiddingSettings);
router.get("/auto-bidding/info/:id", isAuthenticated, autoBiddingController.getAutoBiddingInfo);
router.delete("/auto-bidding/settings/:id", isAuthenticated, autoBiddingController.disableAutoBidding);

module.exports = router;