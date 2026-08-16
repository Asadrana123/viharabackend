// routes/voiceCallbackRoutes.js
//
// Mounted at /api/vapi (see app.js), alongside the existing vapiRoutes.
//   POST  /api/vapi/webhook                 ← VAPI (no login; verified by secret)
//   GET   /api/vapi/callbacks               ← admin dashboard
//   PATCH /api/vapi/callback/:id/cancel     ← admin dashboard
//
// ⚠️ VERIFY THIS IMPORT matches your project's admin guard. This uses the common
//    { isAuthenticatedUser, authorizeRoles } pattern. If your other /api/vapi
//    admin endpoints use a different middleware (e.g. adminAuth.js), swap the
//    line below and the .use() call to match — the two admin routes just need to
//    be admin-only; the webhook must stay open (VAPI can't log in).

const express = require("express");
const router = express.Router();

const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const {
  handleVapiWebhook,
  listCallbacks,
  cancelCallback,
} = require("../controller/voiceCallbackController");

// Public — VAPI posts tool calls here. Secret-verified inside the controller.
router.post("/webhook", handleVapiWebhook);

// Admin only.
router.get(
  "/callbacks",
  isAuthenticated,
  authorizeRoles("admin"),
  listCallbacks
);
router.patch(
  "/callback/:id/cancel",
  isAuthenticated,
  authorizeRoles("admin"),
  cancelCallback
);

module.exports = router;
