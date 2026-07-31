// routes/leadCallRoutes.js
const express = require("express");
const router = express.Router();
const { registerAndCall } = require("../controller/leadCallController");

// Public — the persona landing form posts here.
router.post("/register", registerAndCall);

module.exports = router;
