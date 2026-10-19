const express = require("express");
const multer = require("multer");
const {
  submitAuctionRegistration,
  getRegistrationStatus,
  getUserRegistrations,
  uploadGovernmentId
} = require("../../controller/bidding/auctionRegistrationController");
const { isAuthenticated} = require("../../middleware/auth");

const router = express.Router();

// Government ID: held in memory (never written to disk), 10 MB cap, image or PDF.
const GOVERNMENT_ID_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const governmentIdUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (GOVERNMENT_ID_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Please upload a JPG, PNG, WEBP, HEIC or PDF file"));
  },
});

// Wrap multer so its errors (size/type) return a clean 400 JSON instead of a 500.
function uploadGovernmentIdFile(req, res, next) {
  governmentIdUpload.single("governmentId")(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "File is larger than the 10MB limit"
        : err.message || "Upload failed";
      return res.status(400).json({ success: false, message: msg });
    }
    next();
  });
}

// User routes
router.post("/", isAuthenticated,submitAuctionRegistration);
router.get("/status", isAuthenticated,getRegistrationStatus);
router.get("/user/registrations", isAuthenticated, getUserRegistrations);
router.post("/government-id", isAuthenticated, uploadGovernmentIdFile, uploadGovernmentId);


module.exports = router;
