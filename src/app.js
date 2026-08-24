const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require("cors");

const app = express();

// Import CORS configuration
const { expressCorsOptions } = require("./config/corsConfig");

// Import routes
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const contactRoutes = require("./routes/contactRoutes");
const sellPropertyRoutes = require("./routes/sellPropertyRoutes");
const saveSearchRoutes = require("./routes/savedSearch");
const auctionRegistrationRoutes = require("./routes/auctionRegistrationRoutes");
const authRoutes = require("./routes/auth");
const biddingRoutes = require("./routes/biddingRoutes");
const ebookRoutes = require("./routes/eBookRoutes");
const demographicRoutes = require("./routes/demoGraphicRoutes");
const userPreferencesRoutes = require("./routes/userPreferencesRoutes");
const unsubscribeRoutes = require("./routes/unsubscribeRoutes");
const renovationRoutes = require("./routes/renovationRoutes");
const investmentCalculatorRoutes = require("./routes/investmentCalculatorRoutes");
const coreLogicRoutes = require("./routes/coreLogicRoutes");
const errorMiddleware = require("./middleware/error");
const landingPageLeadRoutes = require("./routes/landingPageLeadRoutes");
const vapiRoutes = require("./routes/vapiRoutes");
const voiceCallbackRoutes = require("./routes/voiceCallbackRoutes"); // ← ADD
const sellerRoutes = require("./routes/sellerRoutes");
const contentRoutes = require("./routes/contentRoutes"); // ← ADD
const careerRoutes=require('./routes/careerRoutes');
const facebookRoutes = require("./routes/facebookRoutes");
const metaCapiRoutes = require("./routes/metaCapiRoutes");
const { startRenovationCleanupJob } = require('./jobs/renovationCleanupJob');
const leadCallRoutes = require("./routes/leadCallRoutes");
const personaLeadRoutes = require("./routes/personaLeadRoutes");
const earlyAccessLeadRoutes = require("./routes/earlyAccessLeadRoutes");
const georgiaStLeadRoutes = require("./routes/georgiaStLeadRoutes");
const rensselaerAveLeadRoutes = require("./routes/rensselaerAveLeadRoutes");
const partnerLeadRoutes = require("./routes/partnerLeadRoutes");
const rb2bRoutes = require("./routes/rb2bRoutes");
const brevoWebhookRoutes = require("./routes/brevoWebhookRoutes");
const sendblueWebhookRoutes = require("./routes/sendblueWebhookRoutes");
const leadNoteRoutes = require("./routes/leadNoteRoutes");
const interestedLeadRoutes = require("./routes/interestedLeadRoutes");
const testLeadRoutes = require("./routes/testLeadRoutes");
const stopCallingRoutes = require("./routes/stopCallingRoutes");
const propertyImportRoutes = require("./routes/propertyImportRoutes");
// Middleware
app.use(cookieParser());
app.use(cors(expressCorsOptions));
app.use(bodyParser.json({ limit: "5mb", verify: (req, res, buf) => { req.rawBody = buf; } }));
// MongoDB Connection with Connection Pooling
mongoose.connect(process.env.DB_URI, {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
  .then(() => {
    console.log('MongoDB Connected with pool size: 50');
    // Start the hourly cleanup of unsaved renovation records.
    startRenovationCleanupJob();
  })
  .catch(err => console.log('MongoDB Connection Error:', err));

// Home route
app.get("/", (req, res) => {
  res.status(200).send("Server is running!");
});

// API Routes
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/product', productRoutes);
app.use('/api/v1/demographics', demographicRoutes);
app.use("/api/saveContact", contactRoutes);
app.use("/api/sellProperty", sellPropertyRoutes);
app.use("/auth", authRoutes);
app.use("/api/user/save-searches", saveSearchRoutes);
app.use('/api/auction-registration', auctionRegistrationRoutes);
app.use('/api/bidding', biddingRoutes);
app.use("/api/ebook", ebookRoutes);
app.use("/api/v1/user", userPreferencesRoutes);
app.use("/api", unsubscribeRoutes);
app.use("/api/property-renovation", renovationRoutes);
app.use('/api/v1/investment-calculator', investmentCalculatorRoutes);
app.use("/api/v1/corelogic", coreLogicRoutes);
app.use("/api/landing/", landingPageLeadRoutes);
app.use("/api/vapi", voiceCallbackRoutes); // MUST be before vapiRoutes — keeps /webhook open
app.use("/api/vapi", vapiRoutes);
app.use("/api/v1/seller", sellerRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/content", contentRoutes); // ← ADD
app.use("/api/careers", careerRoutes); // ← ADD
app.use("/api/v1/lead", leadCallRoutes);
app.use("/api/capi", metaCapiRoutes);
app.use("/api/v1/persona-lead", personaLeadRoutes);
app.use("/api/v1/early-access", earlyAccessLeadRoutes);
app.use("/api/v1/georgia-st", georgiaStLeadRoutes);
app.use("/api/v1/rensselaer-ave", rensselaerAveLeadRoutes);
app.use("/api/v1/partner", partnerLeadRoutes);
app.use("/api/v1/rb2b", rb2bRoutes);
app.use("/api/webhooks/brevo", brevoWebhookRoutes);
app.use("/api/webhooks/sendblue", sendblueWebhookRoutes);
app.use("/api/v1/lead-notes", leadNoteRoutes);
app.use("/api/v1/interested-leads", interestedLeadRoutes);
app.use("/api/v1/test-leads", testLeadRoutes);
app.use("/api/v1/lead-calling", stopCallingRoutes);
app.use("/api/v1/property-import", propertyImportRoutes);
// Error Middleware
app.use(errorMiddleware);

module.exports = app;
