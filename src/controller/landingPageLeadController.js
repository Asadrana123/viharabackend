// controller/landingPageLeadController.js
const LandingPageLead = require('../model/landingPageLeadModel');
const catchAsyncError = require('../middleware/catchAsyncError');
const Errorhandler = require('../utils/errorhandler');

exports.createLead = catchAsyncError(async (req, res, next) => {
  const { name, email, phone } = req.body;
   console.log(name,email,phone);
  // name and phone are required
  if (!name || !phone) {
    return next(new Errorhandler('Name and phone number are required', 400));
  }

  // validate email format only if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new Errorhandler('Please enter a valid email address', 400));
    }
  }

  try {
    const lead = await LandingPageLead.create({
      name,
      phone,
      ...(email && { email }), // only include email if provided
    });

    res.status(201).json({ success: true, lead });

  } catch (err) {
    // MongoDB duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      const message = field === 'phone'
        ? 'This phone number is already registered'
        : 'This email address is already registered';
      return next(new Errorhandler(message, 409));
    }
    return next(err);
  }
});