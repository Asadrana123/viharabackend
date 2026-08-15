// routes/brevoWebhookRoutes.js
const express = require("express");
const router = express.Router();
const { handleEmailWebhook, ping } = require("../controller/brevoWebhookController");

// Public — no auth middleware here. Brevo can't send cookies/JWTs; the secret
// token checked inside the controller is what protects this endpoint.
router.post("/email", handleEmailWebhook);

// GET health check for manual verification (browser). Not used by Brevo.
router.get("/email", ping);

module.exports = router;
