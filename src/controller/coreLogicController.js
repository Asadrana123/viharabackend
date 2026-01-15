/**
 * CoreLogic Investment Controller
 * Handles requests for property data specifically from CoreLogic API
 */

const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const Product = require("../model/productModel");
const coreLogicService = require("../services/coreLogicService");

/**
 * @desc    Get full investment analysis from CoreLogic
 * @route   GET /api/v1/corelogic/:id
 * @access  Public
 */
exports.getCoreLogicInvestmentData = catchAsyncError(async (req, res, next) => {
  const property = await Product.findById(req.params.id);
  if (!property) return next(new Errorhandler("Property not found", 404));

  const result = await coreLogicService.getCoreLogicInvestmentData(
    property.street, property.city, property.state, property.zipCode
  );

  // Even if CoreLogic fails, we return the property info from our DB
  res.status(200).json({
    success: true,
    data: {
      property: {
        _id: property._id,
        productName: property.productName,
        purchasePrice: property.currentBid || property.startBid,
        // ... other property fields
      },
      coreLogicData: result.status === 'success' ? {
        clipId: result.clipId,
        valuation: result.valuation,
        rental: result.rental, // Will be null if RAM failed
        taxData: result.taxData
      } : null,
      message: result.status === 'error' ? result.message : undefined
    }
  });
});

/**
 * @desc    Get CoreLogic valuation (AVM) only
 * @route   GET /api/v1/corelogic/:id/valuation
 */
exports.getPropertyValuation = catchAsyncError(async (req, res, next) => {
  const property = await Product.findById(req.params.id);
  if (!property) return next(new Errorhandler("Property not found", 404));

  const clip = await coreLogicService.findClipId(
    property.street, property.city, property.state, property.zipCode
  );
  
  if (!clip) return next(new Errorhandler("Property not found in CoreLogic", 404));

  const valuation = await coreLogicService.getPropertyValuation(clip);
  
  res.status(200).json({
    success: true,
    data: valuation
  });
});

/**
 * @desc    Get CoreLogic rental estimate only
 * @route   GET /api/v1/corelogic/:id/rental
 */
exports.getRentalEstimate = catchAsyncError(async (req, res, next) => {
  const property = await Product.findById(req.params.id);
  if (!property) return next(new Errorhandler("Property not found", 404));

  const clip = await coreLogicService.findClipId(
    property.street, property.city, property.state, property.zipCode
  );
  
  if (!clip) return next(new Errorhandler("Property not found in CoreLogic", 404));

  const rental = await coreLogicService.getRentalEstimate(clip);
  
  res.status(200).json({
    success: true,
    data: rental
  });
});