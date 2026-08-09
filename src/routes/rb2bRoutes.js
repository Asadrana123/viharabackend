const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const { ingestVisitor, getAllVisitors } = require("../controller/rb2bController");

const router = express.Router();

// Public webhook — RB2B can't send auth headers, so it's guarded by a URL token.
router.post("/ingest/:token", ingestVisitor);

// Admin list.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllVisitors);

module.exports = router;