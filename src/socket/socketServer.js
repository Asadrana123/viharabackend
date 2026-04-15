// socketServer.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { socketIOCorsOptions } = require('../config/corsConfig');
const User = require('../model/userModel');
const { initializeHandlers, registerSocketHandlers } = require('./socketHandlers');
const rateLimiter = require('../middleware/socketRateLimitMiddleware');

// Store active auctions in memory
const activeAuctions = new Map();
const userAuctions = new Map();
const userSocketsMap = new Map();
const lastBroadcastTime = new Map();
const userBidThrottle = new Map();

const CLEANUP_INTERVAL = 3600000;

function initSocketServer(server) {
  const io = socketIO(server, socketIOCorsOptions);

  initializeHandlers(io, activeAuctions, userAuctions, userSocketsMap, lastBroadcastTime, userBidThrottle);

  io.use((socket, next) => {
    if (!rateLimiter.canConnect(socket.userId)) {
      return next(new Error('Too many connections'));
    }
    next();
  });

  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie;

      if (!cookies) {
        return next(new Error('Authentication error: Cookies missing'));
      }

      const tokenMatch = cookies.match(/token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        return next(new Error('Authentication error: Token cookie missing'));
      }

      const decoded = jwt.verify(token, process.env.secret);
      socket.userId = decoded.id;

      // Fetch name, email, and role
      const user = await User.findById(decoded.id).select('name email role');
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;

      if (!userAuctions.has(socket.userId)) {
        userAuctions.set(socket.userId, new Set());
      }

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

    rateLimiter.addConnection(socket.userId);

    socket.on('disconnect', () => {
      rateLimiter.removeConnection(socket.userId);
      console.log(`User disconnected: ${socket.userId} (Socket ID: ${socket.id})`);
    });

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

  function setupCleanupInterval() {
    setInterval(() => {
      const now = new Date();

      for (const [auctionId, auctionData] of activeAuctions.entries()) {
        const endTime = new Date(auctionData.endTime);
        const timeSinceEnd = now - endTime;

        if (timeSinceEnd > 3 * 60 * 60 * 1000) {
          activeAuctions.delete(auctionId);
          console.log(`Removed auction ${auctionId} from memory after 3 hours`);
        }
      }

      for (const [key, time] of lastBroadcastTime.entries()) {
        if (now - time > 60 * 60 * 1000) {
          lastBroadcastTime.delete(key);
        }
      }
    }, 60 * 60 * 1000);
  }

  setupCleanupInterval();

  setInterval(async () => {
    try {
      const Product = require('../model/productModel');
      for (const [auctionId, auctionData] of activeAuctions.entries()) {
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
