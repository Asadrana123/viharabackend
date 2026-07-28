const express = require("express");
const router = express.Router();
const {
  verifyWebhook,
  receiveWebhook,
} = require("../controller/facebookLeadController");

// Public — Meta calls these directly, so no auth middleware. The POST is
// protected instead by X-Hub-Signature-256 verification in the controller.
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

module.exports = router;
