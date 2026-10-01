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
const { requireSendifyEnabled } = require("../../middleware/sendifyEnabled");

router.use(isAuthenticated, authorizeRoles("admin"));

// /health stays reachable even when disabled — it's the one endpoint whose
// whole job is reporting that state, with more detail than the generic 503
// below. Every other route needs the feature actually on.
router.get("/health", health);
router.use(requireSendifyEnabled);

router.post("/messages", sendMessage);
router.post("/messages/bulk", sendBulkMessages);

router.post("/lines", createLine);
router.get("/lines", listLines);
router.get("/lines/:id", getLine);
router.patch("/lines/:id", updateLine);

module.exports = router;
