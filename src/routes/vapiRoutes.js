const express = require("express");
const router = express.Router();
const { launchCampaign, getCalls } = require("../controller/vapiController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// Only admins can launch campaigns
router.post(
  "/launch-campaign",
  // isAuthenticated,
  // authorizeRoles("admin"),
  launchCampaign
);

// GET all calls from VAPI with stats + lead scores
router.get(
  "/calls",
  isAuthenticated,
  authorizeRoles("admin"),
  getCalls
);

module.exports = router;