// routes/demographicRoutes.js
const express = require("express");
const { 
  analyzeDemographics,
  getCounties,
  getCensusVariables,
  getStates
} = require("../controller/demoGraphicController");
const { isAuthenticated } = require("../middleware/auth");

const router = express.Router();

// Public routes - available without authentication
router.get("/counties", getCounties);
router.get("/states", getStates);
router.get("/variables", getCensusVariables);

// Protected routes - require authentication
router.post("/analyze", isAuthenticated, analyzeDemographics);

module.exports = router;