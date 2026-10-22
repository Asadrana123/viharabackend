// routes/slides/googleSlidesRoutes.js
//
// Mounted at /api/v1/google-slides (see app.js). Admin-only, except the
// callback: Google redirects the browser there, and the signed `state` proves
// which admin started it.
const express = require("express");
const multer = require("multer");
const router = express.Router();

// A .pptx to restyle: held in memory only, 50 MB cap.
const pptxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.pptx$/i.test(file.originalname)) return cb(null, true);
    cb(new Error("Please upload a PowerPoint (.pptx) file"));
  },
});

const { getStatus, connect, callback, disconnect } = require("../../controller/slides/googleSlidesController");
const { createDeck, getDeck, listDecks, reviseDeck, restyleDeck } = require("../../controller/slides/slideDeckController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

const admin = [isAuthenticated, authorizeRoles("admin")];

router.get("/callback", callback);
router.get("/status", ...admin, getStatus);
router.get("/connect", ...admin, connect);
router.post("/disconnect", ...admin, disconnect);

// Decks made by the Slides agent
router.get("/decks", ...admin, listDecks);
router.post("/decks", ...admin, createDeck);
router.post("/decks/restyle", ...admin, pptxUpload.single("file"), restyleDeck);
router.get("/decks/:id", ...admin, getDeck);
router.post("/decks/:id/revise", ...admin, reviseDeck);

module.exports = router;
