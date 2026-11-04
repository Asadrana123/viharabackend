// routes/leadCallRoutes.js
const express = require("express");
const router = express.Router();
const { registerAndCall } = require("../../controller/calling/leadCallController");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");

// Public — the persona landing form posts here. Starts a Maya call, so it gets
// the same rate limit + captcha as the other call-starting forms.
router.post("/register", formRateLimit({ name: "persona-lead" }), verifyRecaptcha, registerAndCall);

module.exports = router;
