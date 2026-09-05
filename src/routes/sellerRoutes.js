const express = require("express");
const { isAuthenticated } = require("../middleware/auth");
const {
  getSellerAuctions,
  getSellerAuctionBids,
  getSellerAuctionDetails,
  getSellerAuctionRegistrations,
  exportSellerAuctionPdf,
  exportSellerAuctionExcel
} = require("../controller/sellerController");

const router = express.Router();

router.get("/auctions", isAuthenticated, getSellerAuctions);

router.get("/auction/:auctionId/bids", isAuthenticated, getSellerAuctionBids);

router.get("/auction/:auctionId/details", isAuthenticated, getSellerAuctionDetails);

router.get("/auction/:auctionId/registrations", isAuthenticated, getSellerAuctionRegistrations);

router.get("/auction/:auctionId/export/pdf", isAuthenticated, exportSellerAuctionPdf);

router.get("/auction/:auctionId/export/excel", isAuthenticated, exportSellerAuctionExcel);

module.exports = router;
