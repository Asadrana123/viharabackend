const express = require("express");
const router = express.Router();
const {
  verifyWebhook,
  receiveWebhook,
  testCall,
} = require("../controller/facebookLeadController");

// Public — Meta calls these directly, so no auth middleware. The POST is
// protected instead by X-Hub-Signature-256 verification in the controller.
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

// TEMPORARY browser test — remove once live leads flow.
router.get("/test-call", testCall);

module.exports = router;
