// controller/ebookController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const sendEmail = require("../utils/sendEmail");
const EbookRequest = require("../model/EBookModel");

// Request an e-book
exports.requestEbook = catchAsyncError(
  async (req, res, next) => {
    const { email, name } = req.body;
    
    if (!email) {
      return next(new Errorhandler("Email is required", 400));
    }
    
    // Check if this email has already requested the e-book
    const existingRequest = await EbookRequest.findOne({ email });
    
    if (existingRequest) {
      // If already requested, send it again without creating a new record
      await sendEbookEmail(email, name || existingRequest.name || "there");
      
      return res.status(200).json({
        success: true,
        message: "E-book has been resent to your email"
      });
    }
    
    // Create a new request
    const ebookRequest = await EbookRequest.create({
      email,
      name: name || "",
      requestDate: Date.now()
    });
    
    // Send the e-book
    await sendEbookEmail(email, name || "there");
    
    res.status(201).json({
      success: true,
      message: "E-book has been sent to your email"
    });
  }
);

// Helper function to send the e-book email
const sendEbookEmail = async (email, name) => {
  try {
    const emailSubject = "Your Free E-Book on Distressed Properties";
    const emailContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0384fb; color: white; padding: 15px; text-align: center; }
          .content { padding: 20px; line-height: 1.6; }
          .button { background-color: #0384fb; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; margin: 20px 0; border-radius: 4px; }
          .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Your Distressed Properties E-Book</h2>
          </div>
          <div class="content">
            <p>Hello ${name},</p>
            <p>Thank you for your interest in our guide to investing in distressed properties.</p>
            <p>Attached to this email, you'll find our comprehensive e-book that covers:</p>
            <ul>
              <li>How to identify undervalued distressed properties</li>
              <li>Due diligence checklist for distressed property investments</li>
              <li>Negotiation strategies for acquiring distressed properties</li>
              <li>Financing options for distressed property purchases</li>
              <li>Tips for renovation and maximizing ROI</li>
            </ul>
            <p>If you have any questions after reviewing the material, feel free to contact our team.</p>
            <p><a href="${process.env.CLIENT_URL}/resources/distressed-properties-guide.pdf" class="button">Download Your E-Book</a></p>
            <p>Happy investing!</p>
            <p>The Vihara Team</p>
          </div>
          <div class="footer">
            If you didn't request this e-book, please disregard this email.
          </div>
        </div>
      </body>
      </html>
    `;
    
    await sendEmail(
      email,
      name,
      emailSubject,
      emailContent
    );
    
    return true;
  } catch (error) {
    console.error("Error sending e-book email:", error);
    throw error;
  }
};

// Get all e-book requests (admin function)
exports.getAllEbookRequests = catchAsyncError(
  async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const requests = await EbookRequest.find()
      .sort({ requestDate: -1 })
      .skip(skip)
      .limit(Number(limit));
      
    const total = await EbookRequest.countDocuments();
    
    res.status(200).json({
      success: true,
      requests,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
      }
    });
  }
);