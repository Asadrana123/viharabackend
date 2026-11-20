// routes/leads/dealSheetRoutes.js
//
// Mounted at /api/v1/deal-sheet. Read by the website's vihara.ai/s/<token> page and vihara.ai/b/<ref> redirect
// (controller/leads/dealSheetController.js).
const express = require("express");
const formRateLimit = require("../../middleware/formRateLimit");
const { getDealSheet, getDealSheetPdf, getBookingLink } = require("../../controller/leads/dealSheetController");

const router = express.Router();

// Before /:token, which would otherwise take "book" as a token.
router.get("/book/:ref", formRateLimit({ name: "deal-book", max: 30 }), getBookingLink);
router.get("/:token/pdf", formRateLimit({ name: "deal-pdf", max: 20 }), getDealSheetPdf);
router.get("/:token", getDealSheet);

module.exports = router;
