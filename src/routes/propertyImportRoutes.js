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

// In-memory storage, 50 MB cap, PDF only.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") return cb(null, true);
        cb(new Error("Only PDF files are allowed"));
    },
});

// Wrap multer so its errors (size/type) return a clean 400 JSON instead of a 500.
function uploadPdf(req, res, next) {
    upload.single("pdf")(req, res, (err) => {
        if (err) {
            const msg = err.code === "LIMIT_FILE_SIZE"
                ? "PDF is larger than the 50MB limit"
                : err.message || "Upload failed";
            return res.status(400).json({ success: false, message: msg });
        }
        next();
    });
}

router.post(
    "/parse",
    isAuthenticated,
    authorizeRoles("admin"),
    uploadPdf,
    parseFromPropStream
);

router.post(
    "/upload-images",
    isAuthenticated,
    authorizeRoles("admin"),
    uploadImages
);

module.exports = router;
