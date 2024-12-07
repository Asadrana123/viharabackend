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
const PORT = process.env.PORT || 3001;
const errorMiddleware = require("./middleware/error");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const savePropertyRoutes = require("./routes/savePropertyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const sellPropertyRoutes = require("./routes/sellPropertyRoutes");
const authRoutes = require("./routes/auth")
app.use(cookieParser());
require('./passport'); // This executes the setup code
// Connect to MongoDB

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
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/product', productRoutes);
app.use("/api/v1/saveProperty", savePropertyRoutes);
app.use("/api/saveContact", contactRoutes);
app.use("/api/sellProperty", sellPropertyRoutes);
app.use("/auth", authRoutes)
app.use('/', (req, res) => {
  res.send('Hello World!');
});
app.use(errorMiddleware);
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
