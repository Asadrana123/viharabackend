// routes/metaCapiRoutes.js
const express = require("express");
const { trackEvent } = require("../../controller/integrations/metaCapiController");
const formRateLimit = require("../../middleware/formRateLimit");
const router = express.Router();

// Public — fired from the browser thank-you pages. No captcha (it's a
// background beacon), but one visitor can't flood Meta with fake conversions.
router.post("/track", formRateLimit({ name: "capi", max: 30, message: "Too many events." }), trackEvent);

module.exports = router;