// routes/sendify/sendifyAdminRoutes.js
//
// Mounted at /api/v1/sendify (see app.js). Admin-only, same pattern as
// outboundRoutes.js. Phase 2 adds the real POST /messages(/bulk) (queued,
// routed) and removes Phase 1's temporary dev/send-direct. Later phases add
// conversations/contacts/lines-status-actions/stats per sendify-infra.md §8.1.
const express = require("express");
const router = express.Router();

const { health } = require("../../controller/sendify/sendifyAdminController");
const { createLine, listLines, getLine, updateLine } = require("../../controller/sendify/sendifyLineController");
const { sendMessage, sendBulkMessages } = require("../../controller/sendify/sendifyMessageController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

// Literal paths before /lines/:id so "health"/"messages" never get swallowed as an id.
router.get("/health", health);

router.post("/messages", sendMessage);
router.post("/messages/bulk", sendBulkMessages);

router.post("/lines", createLine);
router.get("/lines", listLines);
router.get("/lines/:id", getLine);
router.patch("/lines/:id", updateLine);

module.exports = router;
