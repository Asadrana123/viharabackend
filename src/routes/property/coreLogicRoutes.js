/**
 * CoreLogic Investment Routes
 * Dedicated endpoints for property data sourced from CoreLogic
 */

const express = require('express');
const router = express.Router();
const {
  getCoreLogicInvestmentData,
  getPropertyValuation,
  getRentalEstimate
} = require("../../controller/property/coreLogicController");
const formRateLimit = require("../../middleware/formRateLimit");

// Public, and each lookup is a paid CoreLogic call, so one visitor can't loop
// over property ids. Results are also cached per property (see the controller).
router.use(formRateLimit({ name: "corelogic", max: 20, message: "Too many requests. Please wait a few minutes and try again." }));

/**
 * @route   GET /api/v1/corelogic/:id
 * @desc    Get complete investment analysis (Valuation + Rental + Tax)
 * @access  Public
 */
router.get("/:id", getCoreLogicInvestmentData);

/**
 * @route   GET /api/v1/corelogic/:id/valuation
 * @desc    Get property valuation (AVM) only
 * @access  Public
 */
router.get("/:id/valuation", getPropertyValuation);

/**
 * @route   GET /api/v1/corelogic/:id/rental
 * @desc    Get rental estimate only
 * @access  Public
 */
router.get("/:id/rental", getRentalEstimate);

module.exports = router;