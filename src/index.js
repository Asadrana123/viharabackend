require('dotenv').config();
const http = require('http');
const app = require('./app');
const initSocketServer = require('./socket/socketServer');
const { setIoInstance } = require('./socket/getIoInstance');
require('./passport');

const PORT = process.env.PORT || 8000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocketServer(server);
setIoInstance(io)

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});