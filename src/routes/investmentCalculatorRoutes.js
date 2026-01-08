/**
 * Investment Calculator Routes
 * Separate routes for investment calculator functionality
 */

const express = require('express');
const router = express.Router();
const {
  getPropertyInvestmentData,
  getPropertyValuation,
  getRentalEstimate,
  getComparables
} = require("../controller/investmentCalculatorController");

/**
 * @route   GET /api/v1/investment-calculator/:id
 * @desc    Get all investment calculator data (valuation + rental + comparables + market)
 * @access  Public
 */
router.get("/:id", getPropertyInvestmentData);

/**
 * @route   GET /api/v1/investment-calculator/:id/valuation
 * @desc    Get property valuation only
 * @access  Public
 */
router.get("/:id/valuation", getPropertyValuation);

/**
 * @route   GET /api/v1/investment-calculator/:id/rental
 * @desc    Get rental estimate only
 * @access  Public
 */
router.get("/:id/rental", getRentalEstimate);

/**
 * @route   GET /api/v1/investment-calculator/:id/comparables
 * @desc    Get comparable sales only
 * @access  Public
 */
router.get("/:id/comparables", getComparables);

module.exports = router;
