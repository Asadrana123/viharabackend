// controller/landingPageLeadController.js
const LandingPageLead = require('../model/landingPageLeadModel');
const catchAsyncError = require('../middleware/catchAsyncError');
const Errorhandler = require('../utils/errorhandler');
const sendEmail = require('../utils/sendEmail');
const getNewLeadEmail = require('../htmlPages/newLeadEmail');

exports.getAllLeads = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    LandingPageLead.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LandingPageLead.countDocuments()
  ]);

  res.status(200).json({
    success: true,
    leads,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit)
    }
  });
});

exports.createLead = catchAsyncError(async (req, res, next) => {
  const { name, email, phone } = req.body;
  console.log(name, email, phone);

  if (!name || !phone) {
    return next(new Errorhandler('Name and phone number are required', 400));
  }

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
      ...(email && { email }),
    });

    // Notify senior — fire and forget, don't block the response
    sendEmail(
      'vin@vihara.ai',
      'Vihara',
      'New Lead Registered on Vihara',
      getNewLeadEmail(name, phone, email, new Date(lead.createdAt).toLocaleString())
    );
    
    res.status(201).json({ success: true, lead });

  } catch (err) {
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