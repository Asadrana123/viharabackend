// routes/ebookRoutes.js
const express = require("express");
const { requestEbook, getAllEbookRequests } = require("../../controller/integrations/eBookRequestController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");

const router = express.Router();

// Public route to request an e-book
router.post("/request", formRateLimit({ name: "ebook" }), verifyRecaptcha, requestEbook);

// Admin route to get all e-book requests
router.get(
  "/requests",
  isAuthenticated,
  authorizeRoles("admin"),
  getAllEbookRequests
);

module.exports = router;