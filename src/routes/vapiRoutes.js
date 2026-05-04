const express = require("express");
const router = express.Router();
const { launchCampaign } = require("../controller/vapiController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// Only admins can launch campaigns
router.post("/launch-campaign",
    // isAuthenticated,
    // authorizeRoles("admin"),
    launchCampaign);

module.exports = router;
