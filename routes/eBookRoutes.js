// routes/ebookRoutes.js
const express = require("express");
const { requestEbook, getAllEbookRequests } = require("../controller/eBookRequestController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

// Public route to request an e-book
router.post("/request", requestEbook);

// Admin route to get all e-book requests
router.get(
  "/requests",
  isAuthenticated,
  authorizeRoles("admin"),
  getAllEbookRequests
);

module.exports = router;