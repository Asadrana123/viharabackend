// routes/testLeadRoutes.js
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const { getTestLeads } = require("../controller/testLeadController");

const router = express.Router();

// Admin-only: consolidated list of every "test"-named lead across all funnels.
router.get(
  "/",
  isAuthenticated,
  authorizeRoles("admin"),
  getTestLeads
);

module.exports = router;
