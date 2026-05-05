const express = require("express");
const { isAuthenticated } = require("../middleware/auth");
const { getSellerAuctions, getSellerAuctionBids } = require("../controller/sellerController");

const router = express.Router();

router.get("/auctions", isAuthenticated, getSellerAuctions);

router.get("/auction/:auctionId/bids", isAuthenticated, getSellerAuctionBids);

module.exports = router;
