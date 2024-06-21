// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;
const errorMiddleware=require("./middleware/error");
const userRoutes=require("./routes/userRoutes");
// Connect to MongoDB
app.use(bodyParser.json());
mongoose.connect('mongodb://localhost:27017/mydatabase')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Define routes
app.use('/api/v1/user',userRoutes);
app.get('/', (req, res) => {
  res.send('Hello World!');
});
app.use(errorMiddleware);
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
