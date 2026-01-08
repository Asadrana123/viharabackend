/**
 * Investment Calculator Controller
 * Handles all investment calculator related requests
 */

const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const attomService = require("../services/attomService");

/**
 * @desc    Get investment calculator data for a property
 * @route   GET /api/v1/investment-calculator/:id
 * @access  Public
 */
exports.getPropertyInvestmentData = catchAsyncError(async (req, res, next) => {
  try {
    // Get property from database
    const property = await Product.findById(req.params.id);

    if (!property) {
      return next(new Errorhandler("Property not found", 404));
    }

    // Validate required address fields
    if (!property.street || !property.city || !property.state || !property.zipCode) {
      return next(new Errorhandler("Incomplete property address", 400));
    }

    // Fetch data from ATTOM
    const attomData = await attomService.getPropertyInvestmentData(
      property.street,
      property.city,
      property.state,
      property.zipCode
    );
    if (attomData.status === 'error') {
      return next(new Errorhandler("Failed to fetch investment data from ATTOM", 500));
    }

    // Combine property data + ATTOM data
    const investmentData = {
      property: {
        _id: property._id,
        productName: property.productName,
        street: property.street,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
        beds: property.beds,
        baths: property.baths,
        sqft: property.squareFootage,
        lotSize: property.lotSize,
        yearBuilt: property.yearBuilt,
        propertyType: property.propertyType,
        purchasePrice: property.startBid || property.currentBid,
        monthlyHOADues: property.monthlyHOADues,
        apn: property.apn
      },
      attomData: {
        valuation: attomData.valuation,
        rental: attomData.rental,
        comparables: attomData.comparables,
        marketTrends: attomData.marketTrends,
        taxData: attomData.taxData
      },
      fetchedAt: attomData.fetchedAt
    };

    res.status(200).json({
      success: true,
      data: investmentData
    });

  } catch (error) {
    console.error("Error in getPropertyInvestmentData:", error);
    return next(new Errorhandler(error.message, 500));
  }
});

/**
 * @desc    Get ATTOM valuation only
 * @route   GET /api/v1/investment-calculator/:id/valuation
 * @access  Public
 */
exports.getPropertyValuation = catchAsyncError(async (req, res, next) => {
  try {
    const property = await Product.findById(req.params.id);

    if (!property) {
      return next(new Errorhandler("Property not found", 404));
    }

    if (!property.street || !property.city || !property.state || !property.zipCode) {
      return next(new Errorhandler("Incomplete property address", 400));
    }

    const valuation = await attomService.getPropertyValuation(
      property.street,
      property.city,
      property.state,
      property.zipCode
    );

    if (!valuation) {
      return next(new Errorhandler("Valuation data not available", 404));
    }

    res.status(200).json({
      success: true,
      data: valuation
    });

  } catch (error) {
    console.error("Error in getPropertyValuation:", error);
    return next(new Errorhandler(error.message, 500));
  }
});

/**
 * @desc    Get ATTOM rental estimate only
 * @route   GET /api/v1/investment-calculator/:id/rental
 * @access  Public
 */
exports.getRentalEstimate = catchAsyncError(async (req, res, next) => {
  try {
    const property = await Product.findById(req.params.id);

    if (!property) {
      return next(new Errorhandler("Property not found", 404));
    }

    if (!property.street || !property.city || !property.state || !property.zipCode) {
      return next(new Errorhandler("Incomplete property address", 400));
    }

    const rental = await attomService.getRentalEstimate(
      property.street,
      property.city,
      property.state,
      property.zipCode
    );

    if (!rental) {
      return next(new Errorhandler("Rental estimate not available", 404));
    }

    res.status(200).json({
      success: true,
      data: rental
    });

  } catch (error) {
    console.error("Error in getRentalEstimate:", error);
    return next(new Errorhandler(error.message, 500));
  }
});

/**
 * @desc    Get comparable sales only
 * @route   GET /api/v1/investment-calculator/:id/comparables
 * @access  Public
 */
exports.getComparables = catchAsyncError(async (req, res, next) => {
  try {
    const property = await Product.findById(req.params.id);

    if (!property) {
      return next(new Errorhandler("Property not found", 404));
    }

    if (!property.street || !property.city || !property.state || !property.zipCode) {
      return next(new Errorhandler("Incomplete property address", 400));
    }

    const comparables = await attomService.getComparableSales(
      property.street,
      property.city,
      property.state,
      property.zipCode
    );

    if (!comparables || comparables.length === 0) {
      return next(new Errorhandler("Comparable sales data not available", 404));
    }

    res.status(200).json({
      success: true,
      data: comparables
    });

  } catch (error) {
    console.error("Error in getComparables:", error);
    return next(new Errorhandler(error.message, 500));
  }
});
