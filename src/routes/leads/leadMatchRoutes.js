// routes/leadMatchRoutes.js
const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const {
  getProperties,
  getLeads,
  getPropertyMatches,
  getLeadMatches,
} = require("../../controller/leads/leadMatchController");

// Admin only — every response carries lead PII.
router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/properties", getProperties);
router.get("/leads", getLeads);
router.get("/property/:id", getPropertyMatches);
router.get("/lead/:leadType/:leadId", getLeadMatches);

module.exports = router;
