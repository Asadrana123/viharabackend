// routes/norCalLeadRoutes.js
const express = require("express");
const router = express.Router();
const { registerNorCalLead } = require("../controller/norCalLeadController");

// Public — Northern California early-access lead capture (store-only).
router.post("/register", registerNorCalLead);

module.exports = router;
