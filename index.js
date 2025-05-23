// index.js
require('dotenv').config();
const express = require('express');
const session = require("express-session");
const passport = require("passport");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 8000;
const errorMiddleware = require("./middleware/error");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const savePropertyRoutes = require("./routes/savePropertyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const sellPropertyRoutes = require("./routes/sellPropertyRoutes");
const saveSearchRoutes = require("./routes/savedSearch");
const auctionRegistrationRoutes=require("./routes/auctionRegistrationRoutes")
const authRoutes = require("./routes/auth")
const biddingRoutes=require("./routes/biddingRoutes")
const unsubscribedEmails=require("./model/unsubscribeModel")
const ebookRoutes = require("./routes/eBookRoutes");
const demographicRoutes = require("./routes/demoGraphicRoutes");
const userPreferencesRoutes = require("./routes/userPreferencesRoutes"); // Add this line
const http = require('http');
const initSocketServer = require('./socketServer');
const server = http.createServer(app);
const io = initSocketServer(server);
app.use(cookieParser());
require('./passport'); // This executes the setup code
// Connect to MongoDB
console.log(PORT);
app.use(session({ secret: process.env.secret, resave: false, saveUninitialized: true }));
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
app.use(bodyParser.json());
mongoose.connect(process.env.DB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Define routes
app.get("/", (req, res) => {
  res.status(200).send("Server is running!");
});
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/product', productRoutes);
app.use("/api/v1/saveProperty", savePropertyRoutes);
app.use('/api/v1/demographics',demographicRoutes);
app.use("/api/saveContact", contactRoutes);
app.use("/api/sellProperty", sellPropertyRoutes);
app.use("/auth", authRoutes);
app.use("/api/user/save-searches",saveSearchRoutes);
app.use('/api/auction-registration',auctionRegistrationRoutes);
app.use('/api/bidding',biddingRoutes);
app.use("/api/ebook", ebookRoutes);
app.use("/api/v1/user", userPreferencesRoutes); // Add this line
app.get("/api/unsubscribe", async (req, res) => {
  const { email } = req.query;

  if (!email) {
      return res.status(400).send("Invalid request: Email is required.");
  }

  try {
      // Check if email already unsubscribed
      const existingEntry = await unsubscribedEmails.findOne({ email });
      if (existingEntry) {
          return res.send("<h2>You have already unsubscribed.</h2>");
      }

      // Save email to database
      await unsubscribedEmails.create({ email });
      console.log(`Unsubscribed: ${email}`);

      res.send("<h2>You have been unsubscribed successfully.</h2>");
  } catch (error) {
      console.error("Error unsubscribing:", error);
      res.status(500).send("<h2>Server error. Please try again later.</h2>");
  }
});
app.use(errorMiddleware);
// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});