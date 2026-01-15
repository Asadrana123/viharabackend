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
} = require("../controller/coreLogicController");

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