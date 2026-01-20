// socketServer.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { socketIOCorsOptions } = require('./config/corsConfig');
const AuctionRegistration = require('./model/auctionRegistration');
const Product = require('./model/productModel');
const User = require('./model/userModel');
const ManualBid = require('./model/manualBiddingModel');
const BidsManager = require('./utils/bidsManager');
const mongoose = require('mongoose');
// Store active auctions in memory
const activeAuctions = new Map();
const userAuctions = new Map(); // Track which auctions each user has joined
const userSocketsMap = new Map(); // Track sockets by user ID to prevent duplicate counts
const lastBroadcastTime = new Map();
const BROADCAST_THROTTLE = 500; // ms between broadcasts

// Initialize socket server
function initSocketServer(server) {
  const io = socketIO(server, socketIOCorsOptions);

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

    // Join auction room
    socket.on('join-auction', async (auctionId) => {
      try {
        // Check if user is authorized to join this auction
        const registration = await AuctionRegistration.findOne({
          userId: socket.userId,
          auctionId: auctionId,
          status: 'approved'
        });

        if (!registration) {
          socket.emit('auction-error', 'You do not have access to this auction');
          return;
        }

        // Join the auction room
        socket.join(auctionId);

        // Check if user already joined this auction with another socket
        const isFirstJoin = !userAuctions.get(socket.userId).has(auctionId);

        // Track that this user joined this auction
        userAuctions.get(socket.userId).add(auctionId);

        console.log(`User ${socket.userId} joined auction: ${auctionId} (First join: ${isFirstJoin})`);

        // Initialize auction data if not exists
        if (!activeAuctions.has(auctionId)) {
          // Get auction details from database
          const auction = await Product.findById(auctionId);
          if (!auction) {
            socket.emit('auction-error', 'Auction not found');
            return;
          }

          // Get the highest bid for this auction
          const highestBid = await BidsManager.getHighestBid(auctionId);

          // Set default values
          let currentBidAmount = auction.startBid;
          let currentBidder = null;

          // If there's a highest bid, get its details
          if (highestBid) {
            currentBidAmount = highestBid.amount;

            // Get bidder info
            const bidderUser = await User.findById(highestBid.userId).select('name');
            if (bidderUser) {
              currentBidder = {
                id: highestBid.userId,
                name: bidderUser.name || 'Unknown'
              };
            }
          }

          // Get recent bids for this auction
          const recentBids = await BidsManager.getRecentBids(auctionId);

          // Determine auction status
          const now = new Date();

          // Handle end time properly
          let endTime;

          // Handle auctionEndTime based on its format
          if (auction.auctionEndTime) {
            // If it's a full date string
            if (typeof auction.auctionEndTime === 'string' && auction.auctionEndTime.includes('T')) {
              endTime = new Date(auction.auctionEndTime);
            }
            // If it's a Date object
            else if (auction.auctionEndTime instanceof Date) {
              endTime = auction.auctionEndTime;
            }
            // If it's just a time string (like "17:00")
            else if (typeof auction.auctionEndTime === 'string') {
              endTime = new Date(auction.auctionEndDate);
              const timeParts = auction.auctionEndTime.split(':');
              if (timeParts.length >= 2) {
                endTime.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
              }
            }
          }
          // Default to end date
          else {
            endTime = new Date(auction.auctionEndDate);
          }

          let auctionStatus = "active";

          if (now > endTime) {
            auctionStatus = "ended";
          }

          // Store auction data in memory
          activeAuctions.set(auctionId, {
            currentBid: currentBidAmount,
            currentBidder: currentBidder,
            participants: 0,
            recentBids: recentBids,
            endTime: endTime,
            auctionStatus: auctionStatus
          });
        }

        // Update participants count only if this is user's first socket joining this auction
        if (isFirstJoin) {
          const auctionData = activeAuctions.get(auctionId);
          auctionData.participants += 1;
          activeAuctions.set(auctionId, auctionData);
        }

        // Send current auction status to the joining user
        socket.emit('auction-status', activeAuctions.get(auctionId));

        // Throttled broadcast of participant count (only if participant count changed)
        if (isFirstJoin) {
          const now = Date.now();
          const lastBroadcast = lastBroadcastTime.get(`participants:${auctionId}`) || 0;

          if (now - lastBroadcast > BROADCAST_THROTTLE) {
            // Notify all users about updated participant count
            const auctionData = activeAuctions.get(auctionId);
            io.to(auctionId).emit('participant-update', {
              count: auctionData.participants
            });

            lastBroadcastTime.set(`participants:${auctionId}`, now);
          }
        }

        // Calculate and emit minimum bid amounts
        const auctionData = activeAuctions.get(auctionId);
        const bidLimits = await BidsManager.calculateMinimumBids(auctionId, auctionData.currentBid);
        socket.emit('min-bid-update', bidLimits);
      } catch (error) {
        console.error('Error joining auction:', error);
        socket.emit('auction-error', 'Failed to join auction');
      }
    });

    socket.on('place-bid', async (data, callback) => {
      const session = await mongoose.startSession();
      session.startTransaction();
      let transactionCommitted = false;
      try {
        const { auctionId, bidAmount } = data;

        if (!auctionId || !bidAmount) {
          callback({ success: false, error: 'Invalid bid data' });
          return;
        }

        const auctionData = activeAuctions.get(auctionId);
        if (!auctionData) {
          callback({ success: false, error: 'Auction not found' });
          return;
        }

        if (auctionData.auctionStatus !== "active") {
          callback({ success: false, error: `Auction is ${auctionData.auctionStatus}` });
          return;
        }

        if (bidAmount <= auctionData.currentBid) {
          callback({ success: false, error: 'Bid must be higher than current bid' });
          return;
        }

        // ✓ All within transaction
        const newManualBid = await BidsManager.createManualBid(
          auctionId,
          socket.userId,
          bidAmount,
          session
        );

        const autoBidResult = await BidsManager.processAutoBids(
          auctionId,
          bidAmount,
          socket.userId,
          session
        );

        // ✓ Commit after ALL database operations
        await session.commitTransaction();
        transactionCommitted = true;

        // ✓ Send acknowledgment BEFORE broadcast
        callback({ success: true, bidId: newManualBid._id, amount: bidAmount });

        // ✓ NOW do socket broadcasts
        const newBid = {
          currentBid: bidAmount,
          currentBidder: { id: socket.userId, name: socket.user.name },
          timestamp: newManualBid.createdAt.toISOString(),
          isAutoBid: false
        };

        auctionData.currentBid = bidAmount;
        auctionData.currentBidder = newBid.currentBidder;
        auctionData.recentBids = [newBid, ...auctionData.recentBids].slice(0, 50);
        activeAuctions.set(auctionId, auctionData);

        io.to(auctionId).emit('bid-update', newBid);

        // Handle auto bid broadcast
        if (autoBidResult) {
          const autoBidder = await User.findById(autoBidResult.userId).select('name');
          const autoBidUpdate = {
            currentBid: autoBidResult.amount,
            currentBidder: { id: autoBidResult.userId, name: autoBidder?.name || 'Unknown' },
            timestamp: new Date().toISOString(),
            isAutoBid: true
          };

          auctionData.currentBid = autoBidResult.amount;
          auctionData.currentBidder = autoBidUpdate.currentBidder;
          auctionData.recentBids = [autoBidUpdate, ...auctionData.recentBids].slice(0, 50);
          activeAuctions.set(auctionId, auctionData);

          io.to(auctionId).emit('bid-update', autoBidUpdate);
        }

        // Extension logic (in-memory only, no DB)
        const now = new Date();
        const endTime = new Date(auctionData.endTime);
        const timeLeftMs = endTime - now;

        if (timeLeftMs > 0 && timeLeftMs < 5 * 60 * 1000) {
          const newEndTime = new Date(endTime.getTime() + 5 * 60 * 1000);
          auctionData.endTime = newEndTime;
          activeAuctions.set(auctionId, auctionData);

          // SEPARATE transaction for extension
          await Product.findByIdAndUpdate(auctionId, {
            auctionEndTime: newEndTime,
            $inc: { auctionExtensionCount: 1 }
          });

          io.to(auctionId).emit('auction-extended', {
            endTime: newEndTime.toISOString()
          });
        }

        // Broadcast bid limits (calculation only)
        const bidLimits = await BidsManager.calculateMinimumBids(auctionId, auctionData.currentBid);
        io.to(auctionId).emit('min-bid-update', bidLimits);

      } catch (error) {
        if (!transactionCommitted) {
          await session.abortTransaction();
        }
        callback({ success: false, error: error.message });
        console.error('Bid error:', error);
      } finally {
        await session.endSession();
      }
    });
    // Handle auction timer
    socket.on('auction-timer', async (data) => {
      const now = Date.now();
      const lastBroadcast = lastBroadcastTime.get(`timer:${data.auctionId}`) || 0;

      if (now - lastBroadcast > BROADCAST_THROTTLE) {
        socket.to(data.auctionId).emit('timer-update', data.timeLeft);
        lastBroadcastTime.set(`timer:${data.auctionId}`, now);

        const auctionData = activeAuctions.get(data.auctionId);
        if (auctionData) {
          let newStatus = auctionData.auctionStatus;

          if (data.timeLeft <= 0) {
            newStatus = "ended";

            if (auctionData.auctionStatus !== "ended") {
              console.log('🎯 Auction ending, finalizing winner...');

              try {
                const auction = await Product.findById(data.auctionId);

                let winningBidAmount = null;
                let winnerId = null;
                let winnerName = null;

                if (auction && auction.currentBid && auction.currentBidder) {
                  winningBidAmount = auction.currentBid;
                  winnerId = auction.currentBidder;

                  const winnerUser = await User.findById(winnerId).select('name');
                  winnerName = winnerUser ? winnerUser.name : 'Unknown';

                  console.log(`🏆 Winner determined: ${winnerName} (${winnerId}) with bid $${winningBidAmount}`);
                } else {
                  console.log('❌ No winner - auction ended with no bids');
                }

                const updateData = {
                  currentBid: winningBidAmount,
                  currentBidder: winnerId,
                  status: "sold"  // This field exists in your model
                };

                await Product.findByIdAndUpdate(data.auctionId, updateData);

                auctionData.auctionStatus = "ended";
                auctionData.winningBid = winningBidAmount;
                auctionData.winningBidder = winnerId;
                auctionData.winnerName = winnerName;

                const finalResults = {
                  auctionStatus: "ended",
                  hasWinner: !!winnerId,
                  winningBid: winningBidAmount,
                  winningBidder: winnerId,
                  winnerName: winnerName,
                  currentBidder: winnerId ? {
                    id: winnerId,
                    name: winnerName
                  } : null,
                  endTime: auctionData.endTime,
                  participants: auctionData.participants || 0,
                  recentBids: auctionData.recentBids || []
                };

                console.log('📢 Broadcasting final results to all clients:', finalResults);

                // ✅ THIS IS THE CRITICAL LINE
                io.to(data.auctionId).emit('auction-ended', finalResults);

              } catch (error) {
                console.error('Error finalizing auction:', error);

                io.to(data.auctionId).emit('auction-ended', {
                  auctionStatus: "ended",
                  hasWinner: false,
                  winningBid: null,
                  winningBidder: null,
                  winnerName: null,
                  currentBidder: null,
                  endTime: auctionData.endTime
                });
              }
            }
          } else {
            newStatus = "active";
          }

          if (newStatus !== auctionData.auctionStatus) {
            auctionData.auctionStatus = newStatus;
            activeAuctions.set(data.auctionId, auctionData);

            if (newStatus !== "ended") {
              io.to(data.auctionId).emit('auction-status', auctionData);
            }
          }
        }
      }
    });

    // Handle explicit leave auction event
    socket.on('leave-auction', (auctionId) => {
      handleLeaveAuction(socket, auctionId);
    });

    // Handle disconnection with cleanup
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId} (Socket ID: ${socket.id})`);

      // Remove this socket from user's active sockets
      if (userSocketsMap.has(socket.userId)) {
        userSocketsMap.get(socket.userId).delete(socket.id);

        // If this was the user's last socket, clean up all auctions this user was in
        if (userSocketsMap.get(socket.userId).size === 0) {
          userSocketsMap.delete(socket.userId);

          // Update participant count for all auctions this user was in
          if (userAuctions.has(socket.userId)) {
            const userRooms = userAuctions.get(socket.userId);
            for (const auctionId of userRooms) {
              handleParticipantLeave(socket.userId, auctionId);
            }

            // Clean up user tracking
            userAuctions.delete(socket.userId);
          }
        }
      }
    });
  });

  // Helper function to handle leave auction
  function handleLeaveAuction(socket, auctionId) {
    if (userAuctions.has(socket.userId) && userAuctions.get(socket.userId).has(auctionId)) {
      // Remove this auction from the user's joined auctions
      userAuctions.get(socket.userId).delete(auctionId);

      // Leave the room
      socket.leave(auctionId);

      // Check if this was the user's last socket in this auction
      const userHasOtherSocketsInAuction = Array.from(io.sockets.sockets.values())
        .some(s => s.id !== socket.id && s.userId === socket.userId && s.rooms.has(auctionId));

      // Only update participant count if this was the user's last socket in this auction
      if (!userHasOtherSocketsInAuction) {
        handleParticipantLeave(socket.userId, auctionId);
      }
    }
  }

  // Helper function to handle participant leaving
  function handleParticipantLeave(userId, auctionId) {
    const auctionData = activeAuctions.get(auctionId);
    if (auctionData) {
      auctionData.participants = Math.max(0, auctionData.participants - 1);
      activeAuctions.set(auctionId, auctionData);

      // Throttled broadcast of participant update
      const now = Date.now();
      const lastBroadcast = lastBroadcastTime.get(`participants:${auctionId}`) || 0;

      if (now - lastBroadcast > BROADCAST_THROTTLE) {
        // Notify remaining users
        io.to(auctionId).emit('participant-update', {
          count: auctionData.participants
        });

        lastBroadcastTime.set(`participants:${auctionId}`, now);
      }
    }
  }

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