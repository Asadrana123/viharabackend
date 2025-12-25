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
const errorMiddleware = require("./middleware/error");

// Middleware
app.use(cookieParser());
app.use(cors(expressCorsOptions));
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.DB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

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
// Error Middleware
app.use(errorMiddleware);

module.exports = app;