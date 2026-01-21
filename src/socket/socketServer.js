// socketServer.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { socketIOCorsOptions } = require('../config/corsConfig');
const User = require('../model/userModel');
const { initializeHandlers, registerSocketHandlers } = require('./socketHandlers');
const rateLimiter = require('../utils/socketRateLimitMiddleware');

// Store active auctions in memory
const activeAuctions = new Map();
const userAuctions = new Map(); // Track which auctions each user has joined
const userSocketsMap = new Map(); // Track sockets by user ID to prevent duplicate counts
const lastBroadcastTime = new Map();
const userBidThrottle = new Map();

const CLEANUP_INTERVAL = 3600000; // Clean every 1 hour

// Initialize socket server
function initSocketServer(server) {
  const io = socketIO(server, socketIOCorsOptions);

  // Initialize handlers with references to global state
  initializeHandlers(io, activeAuctions, userAuctions, userSocketsMap, lastBroadcastTime, userBidThrottle);

  // ✅ Connection limit middleware
  io.use((socket, next) => {
    if (!rateLimiter.canConnect(socket.userId)) {
      return next(new Error('Too many connections'));
    }
    next();
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // ✅ Extract token from cookies
      const cookies = socket.handshake.headers.cookie;

      if (!cookies) {
        return next(new Error('Authentication error: Cookies missing'));
      }

      // Parse the token cookie from the cookie string
      const tokenMatch = cookies.match(/token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        return next(new Error('Authentication error: Token cookie missing'));
      }
      const decoded = jwt.verify(token, process.env.secret);
      socket.userId = decoded.id;

      // Get user info
      const user = await User.findById(decoded.id).select('name email');
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;

      // Initialize user's auctions tracking if not exists
      if (!userAuctions.has(socket.userId)) {
        userAuctions.set(socket.userId, new Set());
      }

      // Track this socket for the user
      if (!userSocketsMap.has(socket.userId)) {
        userSocketsMap.set(socket.userId, new Set());
      }
      userSocketsMap.get(socket.userId).add(socket.id);

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId} (Socket ID: ${socket.id})`);

    // ✅ Track connection for rate limiting
    rateLimiter.addConnection(socket.userId);

    // ✅ Handle disconnection and cleanup
    socket.on('disconnect', () => {
      rateLimiter.removeConnection(socket.userId);
      console.log(`User disconnected: ${socket.userId} (Socket ID: ${socket.id})`);
    });

    // Register all event handlers for this socket
    registerSocketHandlers(socket);
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, time] of userBidThrottle.entries()) {
      if (now - time > 86400000) {
        userBidThrottle.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Cleanup function for inactive auctions
  function setupCleanupInterval() {
    // Run every hour
    setInterval(() => {
      const now = new Date();

      // Clean up activeAuctions that have ended more than 3 hours ago
      for (const [auctionId, auctionData] of activeAuctions.entries()) {
        const endTime = new Date(auctionData.endTime);
        const timeSinceEnd = now - endTime;

        // If ended more than 3 hours ago, remove from memory
        if (timeSinceEnd > 3 * 60 * 60 * 1000) {
          activeAuctions.delete(auctionId);
          console.log(`Removed auction ${auctionId} from memory after 3 hours`);
        }
      }

      // Clean up lastBroadcastTime entries older than 1 hour
      for (const [key, time] of lastBroadcastTime.entries()) {
        if (now - time > 60 * 60 * 1000) {
          lastBroadcastTime.delete(key);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  // Start cleanup interval
  setupCleanupInterval();

  // Periodically sync in-memory data with database (every 2 minutes)
  setInterval(async () => {
    try {
      const Product = require('../model/productModel');
      for (const [auctionId, auctionData] of activeAuctions.entries()) {
        // Only update if auction is active and has a current bidder
        if (auctionData.auctionStatus === "active" && auctionData.currentBidder) {
          await Product.findByIdAndUpdate(auctionId, {
            currentBid: auctionData.currentBid,
            currentBidder: auctionData.currentBidder.id
          });
        }
      }
    } catch (error) {
      console.error('Error syncing auction data with database:', error);
    }
  }, 2 * 60 * 1000);

  return io;
}

module.exports = initSocketServer;