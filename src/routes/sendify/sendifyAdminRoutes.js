// routes/sendify/sendifyAdminRoutes.js
//
// Mounted at /api/v1/sendify (see app.js). Admin-only, same pattern as
// outboundRoutes.js. Phase 1 adds line CRUD + the temporary dev/send-direct
// endpoint (removed again in Phase 2 once the real queue exists). Later
// phases add conversations/contacts/messages/stats per sendify-infra.md §8.1.
const express = require("express");
const router = express.Router();

const { health } = require("../../controller/sendify/sendifyAdminController");
const { createLine, listLines, getLine, updateLine } = require("../../controller/sendify/sendifyLineController");
const { sendDirect } = require("../../controller/sendify/sendifyDevController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

// Literal paths before /lines/:id so "health"/"dev" never get swallowed as an id.
router.get("/health", health);
router.post("/dev/send-direct", sendDirect);

router.post("/lines", createLine);
router.get("/lines", listLines);
router.get("/lines/:id", getLine);
router.patch("/lines/:id", updateLine);

module.exports = router;
