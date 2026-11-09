// routes/usage/spendRoutes.js - AI Spend (admin page tab "AI Spend")
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { requireSyncKey } = require("../../controller/studio/studioController");
const { getSpend, syncSpend, getAnthropicBilling } = require("../../controller/usage/spendController");

const router = express.Router();

// The Creative OS server, with its shared key, before the sign-in check below.
router.post("/sync", requireSyncKey, syncSpend);

router.get("/", isAuthenticated, authorizeRoles("admin"), getSpend);
router.get("/anthropic", isAuthenticated, authorizeRoles("admin"), getAnthropicBilling);

module.exports = router;
