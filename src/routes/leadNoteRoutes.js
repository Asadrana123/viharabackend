// routes/leadNoteRoutes.js
const express = require("express");
const router = express.Router();
const { resolveAdvisor } = require("../middleware/adminAuth");
const {
  whoami,
  addNote,
  updateNote,
  deleteNote,
} = require("../controller/leadNoteController");

// Every note action requires a logged-in advisor.
router.use(resolveAdvisor);

router.get("/whoami", whoami);
router.post("/", addNote);
router.patch("/:id", updateNote);
router.delete("/:id", deleteNote);

module.exports = router;
