const express = require("express");
const router = express.Router();
const {
  launchCampaign,
  getCalls,
  startSingleCall,
  getCampaignStatus,
} = require("../controller/vapiController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

// All voice-agent routes are admin only
router.use(isAuthenticated, authorizeRoles("admin"));

// Dispatch a call to a single contact
router.post("/call", startSingleCall);

// Queue a CSV campaign — returns a jobId immediately
router.post("/launch-campaign", launchCampaign);

// Poll campaign progress
router.get("/campaign/:jobId", getCampaignStatus);

// GET all calls from VAPI with stats + lead scores
router.get("/calls", getCalls);

module.exports = router;