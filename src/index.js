require('dotenv').config();
const http = require('http');
const app = require('./app');
const initSocketServer = require('./socketServer');
require('./passport');

const PORT = process.env.PORT || 8000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocketServer(server);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});