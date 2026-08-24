// routes/propertyImportRoutes.js
//
// Property Importer routes — admin only. PDFs are held in memory (never written
// to disk); pdf-parse reads straight from the buffer.

const express = require("express");
const multer = require("multer");
const {
    parseFromPropStream,
    uploadImages,
} = require("../controller/propertyImportController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

// In-memory storage, 15 MB cap, PDF only.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") return cb(null, true);
        cb(new Error("Only PDF files are allowed"));
    },
});

router.post(
    "/parse",
    isAuthenticated,
    authorizeRoles("admin"),
    upload.single("pdf"),
    parseFromPropStream
);

router.post(
    "/upload-images",
    isAuthenticated,
    authorizeRoles("admin"),
    uploadImages
);

module.exports = router;
