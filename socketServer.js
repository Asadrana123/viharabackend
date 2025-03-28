// socketServer.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const AuctionRegistration = require('./model/auctionRegistration');
const Product = require('./model/productModel');
const User = require('./model/userModel');
const ManualBid = require('./model/manualBiddingModel');
const BidsManager = require('./utils/bidsManager');

// Store active auctions in memory
const activeAuctions = new Map();
const userAuctions = new Map(); // Track which auctions each user has joined
const userSocketsMap = new Map(); // Track sockets by user ID to prevent duplicate counts
const lastBroadcastTime = new Map();
const BROADCAST_THROTTLE = 500; // ms between broadcasts

// Initialize socket server
function initSocketServer(server) {
  const io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
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

    // Place a manual bid via socket
    socket.on('place-bid', async (data) => {
      try {
        const { auctionId, bidAmount } = data;
        
        if (!auctionId || !bidAmount) {
          socket.emit('bid-error', 'Invalid bid data');
          return;
        }

        const auctionData = activeAuctions.get(auctionId);
        if (!auctionData) {
          socket.emit('bid-error', 'Auction not found');
          return;
        }

        // Check if auction is active
        if (auctionData.auctionStatus !== "active") {
          socket.emit('bid-error', `Auction is ${auctionData.auctionStatus}`);
          return;
        }

        // Check if bid is higher than current bid
        if (bidAmount <= auctionData.currentBid) {
          socket.emit('bid-error', `Bid must be higher than current bid (${auctionData.currentBid})`);
          return;
        }

        // Create the manual bid
        const newManualBid = await BidsManager.createManualBid(
          auctionId, 
          socket.userId, 
          bidAmount
        );

        // Format bid for broadcast
        const newBid = {
          currentBid: bidAmount,
          currentBidder: {
            id: socket.userId,
            name: socket.user.name
          },
          timestamp: newManualBid.createdAt.toISOString(),
          isAutoBid: false
        };

        // Update in-memory auction data
        auctionData.currentBid = bidAmount;
        auctionData.currentBidder = newBid.currentBidder;
        auctionData.recentBids = [newBid, ...auctionData.recentBids].slice(0, 50);
        activeAuctions.set(auctionId, auctionData);

        // Update auction in database
        await Product.findByIdAndUpdate(auctionId, {
          currentBid: bidAmount,
          currentBidder: socket.userId
        });

        // Notify all users about the new bid
        io.to(auctionId).emit('bid-update', newBid);

        // Process any auto bids
        const autoBidResult = await BidsManager.processAutoBids(
          auctionId, 
          bidAmount, 
          socket.userId
        );

        // If an auto bid was processed, broadcast it
        if (autoBidResult) {
          // Get bidder info
          const autoBidder = await User.findById(autoBidResult.userId).select('name');
          const autoBidderName = autoBidder ? autoBidder.name : 'Unknown';
          
          // Format auto bid for broadcast
          const autoBidUpdate = {
            currentBid: autoBidResult.amount,
            currentBidder: {
              id: autoBidResult.userId,
              name: autoBidderName
            },
            timestamp: new Date().toISOString(),
            isAutoBid: true
          };

          // Update in-memory auction data
          auctionData.currentBid = autoBidResult.amount;
          auctionData.currentBidder = autoBidUpdate.currentBidder;
          auctionData.recentBids = [autoBidUpdate, ...auctionData.recentBids].slice(0, 50);
          activeAuctions.set(auctionId, auctionData);

          // Update auction in database
          await Product.findByIdAndUpdate(auctionId, {
            currentBid: autoBidResult.amount,
            currentBidder: autoBidResult.userId
          });

          // Notify all users about the auto bid
          io.to(auctionId).emit('bid-update', autoBidUpdate);
        }

        // Check if we need to extend the auction time
        const now = new Date();
        const endTime = new Date(auctionData.endTime);
        const timeLeftMs = endTime - now;

        // If less than 5 minutes left, extend by 5 minutes
        if (timeLeftMs > 0 && timeLeftMs < 5 * 60 * 1000) {
          const newEndTime = new Date(endTime.getTime() + 5 * 60 * 1000);
          auctionData.endTime = newEndTime;
          activeAuctions.set(auctionId, auctionData);

          // Update in database
          await Product.findByIdAndUpdate(auctionId, {
            auctionEndTime: newEndTime,
            $inc: { auctionExtensionCount: 1 } // Increment extension count
          });

          // Notify all users about extension
          io.to(auctionId).emit('auction-extended', {
            endTime: newEndTime.toISOString(),
            extensionCount: (await Product.findById(auctionId)).auctionExtensionCount || 1
          });
        }

        // Calculate and broadcast new minimum bid amounts
        const bidLimits = await BidsManager.calculateMinimumBids(auctionId, auctionData.currentBid);
        io.to(auctionId).emit('min-bid-update', bidLimits);
      } catch (error) {
        console.error('Error placing bid:', error);
        socket.emit('bid-error', 'Failed to place bid');
      }
    });

    // Handle timer updates with throttling
    socket.on('auction-timer', async (data) => {
      const now = Date.now();
      const lastBroadcast = lastBroadcastTime.get(`timer:${data.auctionId}`) || 0;
      
      // Only broadcast timer updates every BROADCAST_THROTTLE ms
      if (now - lastBroadcast > BROADCAST_THROTTLE) {
        socket.to(data.auctionId).emit('timer-update', data.timeLeft);
        lastBroadcastTime.set(`timer:${data.auctionId}`, now);
        
        // Update auction status if needed
        const auctionData = activeAuctions.get(data.auctionId);
        if (auctionData) {
          let newStatus = auctionData.auctionStatus;
          
          if (data.timeLeft <= 0) {
            newStatus = "ended";
            
            // If auction just ended, update the database
            if (auctionData.auctionStatus !== "ended") {
              await Product.findByIdAndUpdate(data.auctionId, {
                auctionStatus: "ended",
                isAuctionComplete: true,
                winningBid: auctionData.currentBid,
                winningBidder: auctionData.currentBidder?.id || null
              });
            }
          } else {
            newStatus = "active"; // Simplify status to just active when time remaining
          }
          
          // If status changed, update and broadcast
          if (newStatus !== auctionData.auctionStatus) {
            auctionData.auctionStatus = newStatus;
            activeAuctions.set(data.auctionId, auctionData);
            
            // Send updated status to all clients
            io.to(data.auctionId).emit('auction-status', auctionData);
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
      
      // Clean up activeAuctions that have ended over 24 hours ago
      for (const [auctionId, auctionData] of activeAuctions.entries()) {
        if (auctionData.participants === 0) {
          const endTime = new Date(auctionData.endTime);
          const timeSinceEnd = now - endTime;
          
          // If ended more than 24 hours ago and no participants, remove from memory
          if (timeSinceEnd > 24 * 60 * 60 * 1000) {
            activeAuctions.delete(auctionId);
            console.log(`Removed inactive auction ${auctionId} from memory`);
          }
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