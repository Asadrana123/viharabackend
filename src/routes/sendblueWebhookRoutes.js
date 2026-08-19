// routes/sendblueWebhookRoutes.js
const express = require("express");
const router = express.Router();
const { handleInboundWebhook, ping } = require("../controller/sendblueWebhookController");

// Public — no auth middleware here. Sendblue can't send cookies/JWTs; the secret
// checked inside the controller (?secret=… or header) is what protects this.
router.post("/receive", handleInboundWebhook);

// GET health check for manual verification in a browser. Not used by Sendblue.
router.get("/receive", ping);

module.exports = router;
