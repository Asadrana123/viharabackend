// routes/metaCapiRoutes.js
const express = require("express");
const { trackEvent } = require("../../controller/integrations/metaCapiController");
const router = express.Router();

// Public — fired from the browser thank-you pages.
router.post("/track", trackEvent);

module.exports = router;