// controller/landingPageLeadController.js
const LandingPageLead = require('../model/landingPageLeadModel');
const catchAsyncError = require('../middleware/catchAsyncError');
const Errorhandler = require('../utils/errorhandler');

exports.createLead = catchAsyncError(async (req, res, next) => {
  const { name, email, phone } = req.body;

  if (!name || !email || !phone) {
    return next(new Errorhandler('Name, email and phone are required', 400));
  }

  const lead = await LandingPageLead.create({ name, email, phone });

  res.status(201).json({ success: true, lead });
});
