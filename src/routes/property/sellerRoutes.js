const express = require("express");
const { isAuthenticated } = require("../../middleware/auth");
const {
  getSellerAuctions,
  getSellerAuctionBids,
  getSellerAuctionDetails,
  getSellerAuctionRegistrations,
  getSellerAuctionRounds,
  exportSellerAuctionPdf,
  exportSellerAuctionExcel
} = require("../../controller/property/sellerController");

const router = express.Router();

router.get("/auctions", isAuthenticated, getSellerAuctions);

router.get("/auction/:auctionId/bids", isAuthenticated, getSellerAuctionBids);

router.get("/auction/:auctionId/details", isAuthenticated, getSellerAuctionDetails);

router.get("/auction/:auctionId/registrations", isAuthenticated, getSellerAuctionRegistrations);

// Auction history — every round held for this property. The endpoints above
// take ?roundId= to show one of these rounds instead of the current one.
router.get("/auction/:auctionId/rounds", isAuthenticated, getSellerAuctionRounds);

router.get("/auction/:auctionId/export/pdf", isAuthenticated, exportSellerAuctionPdf);

router.get("/auction/:auctionId/export/excel", isAuthenticated, exportSellerAuctionExcel);

module.exports = router;
