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

// Middleware
app.use(cookieParser());
app.use(cors(expressCorsOptions));
app.use(bodyParser.json());

// MongoDB Connection with Connection Pooling
mongoose.connect(process.env.DB_URI, {
  maxPoolSize: 50,        // Increase from default 10 to 50
  minPoolSize: 10,        // Keep minimum 10 connections ready
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
  .then(() => console.log('MongoDB Connected with pool size: 50'))
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
// Error Middleware
app.use(errorMiddleware);

module.exports = app;
