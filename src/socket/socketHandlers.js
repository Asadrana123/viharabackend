// socketHandlers.js
const AuctionRegistration = require('../model/auctionRegistration');
const rateLimiter = require('../middleware/socketRateLimitMiddleware');
const Product = require('../model/productModel');
const User = require('../model/userModel');
const BidsManager = require('../utils/bidsManager');
const mongoose = require('mongoose');

let activeAuctions;
let userAuctions;
let userSocketsMap;
let lastBroadcastTime;
let userBidThrottle;
let io;

const BROADCAST_THROTTLE = 500;
const COOLDOWN = 2000;

function initializeHandlers(ioInstance, auctionsMap, userAuctionsMap, socketsMap, broadcastMap, bidThrottleMap) {
  activeAuctions = auctionsMap;
  userAuctions = userAuctionsMap;
  userSocketsMap = socketsMap;
  lastBroadcastTime = broadcastMap;
  userBidThrottle = bidThrottleMap;
  io = ioInstance;
}

function registerSocketHandlers(socket) {
  socket.on('join-auction', async (auctionId) => {
    try {
      if (!rateLimiter.isAllowed(socket.userId, 'join-auction', auctionId)) {
        socket.emit('auction-error', 'Please wait before joining another auction');
        return;
      }

      // Admin bypass — skip registration check
      const isAdmin = socket.user?.role === 'admin';

      if (!isAdmin) {
        const registration = await AuctionRegistration.findOne({
          userId: socket.userId,
          auctionId: auctionId,
          status: 'approved'
        });

        if (!registration) {
          socket.emit('auction-error', 'You do not have access to this auction');
          return;
        }
      }

      socket.join(auctionId);

      const isFirstJoin = !userAuctions.get(socket.userId).has(auctionId);
      userAuctions.get(socket.userId).add(auctionId);

      console.log(`User ${socket.userId} joined auction: ${auctionId} (First join: ${isFirstJoin})`);

      if (!activeAuctions.has(auctionId)) {
        const auction = await Product.findById(auctionId);
        if (!auction) {
          socket.emit('auction-error', 'Auction not found');
          return;
        }

        const highestBid = await BidsManager.getHighestBid(auctionId);

        let currentBidAmount = auction.currentBid;
        let currentBidder = null;
        if (highestBid) {
          currentBidAmount = highestBid.amount;
          const bidderUser = await User.findById(highestBid.userId).select('name');
          if (bidderUser) {
            currentBidder = {
              id: highestBid.userId,
              name: bidderUser.name || 'Unknown'
            };
          }
        }

        const recentBids = await BidsManager.getRecentBids(auctionId);
        const now = new Date();
        let endTime;

        if (auction.auctionEndTime) {
          if (typeof auction.auctionEndTime === 'string' && auction.auctionEndTime.includes('T')) {
            endTime = new Date(auction.auctionEndTime);
          } else if (auction.auctionEndTime instanceof Date) {
            endTime = auction.auctionEndTime;
          } else if (typeof auction.auctionEndTime === 'string') {
            endTime = new Date(auction.auctionEndDate);
            const timeParts = auction.auctionEndTime.split(':');
            if (timeParts.length >= 2) {
              endTime.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
            }
          }
        } else {
          endTime = new Date(auction.auctionEndDate);
        }

        const auctionStatus = now > endTime ? "ended" : "active";

        activeAuctions.set(auctionId, {
          currentBid: currentBidAmount,
          currentBidder: currentBidder,
          participants: 0,
          recentBids: recentBids,
          endTime: endTime,
          auctionStatus: auctionStatus,
          startBid: auction.startBid
        });
      }

      // Admins are observers — don't increment participant count
      if (isFirstJoin && !isAdmin) {
        const auctionData = activeAuctions.get(auctionId);
        auctionData.participants += 1;
        activeAuctions.set(auctionId, auctionData);
      }

      socket.emit('auction-status', activeAuctions.get(auctionId));

      if (isFirstJoin && !isAdmin) {
        const now = Date.now();
        const lastBroadcast = lastBroadcastTime.get(`participants:${auctionId}`) || 0;
        if (now - lastBroadcast > BROADCAST_THROTTLE) {
          const auctionData = activeAuctions.get(auctionId);
          io.to(auctionId).emit('participant-update', { count: auctionData.participants });
          lastBroadcastTime.set(`participants:${auctionId}`, now);
        }
      }

      const freshAuctionData = activeAuctions.get(auctionId);
      const bidLimits = await BidsManager.calculateMinimumBids(auctionId, freshAuctionData.currentBid || freshAuctionData.startBid);
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
    const key = `${socket.userId}:${data.auctionId}`;
    const lastBidTime = userBidThrottle.get(key) || 0;
    const now = Date.now();

    if (now - lastBidTime < COOLDOWN) {
      callback({ success: false, error: 'Wait before placing next bid' });
      return;
    }
    userBidThrottle.set(key, now);
    try {
      const { auctionId, bidAmount } = data;

      if (!auctionId || !bidAmount) {
        callback({ success: false, error: 'Invalid bid data' });
        return;
      }

      if (typeof bidAmount !== 'number' || !Number.isFinite(bidAmount)) {
        callback({ success: false, error: 'Bid amount must be a valid number' });
        return;
      }

      if (bidAmount <= 0) {
        callback({ success: false, error: 'Bid amount must be positive' });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(auctionId)) {
        callback({ success: false, error: 'Invalid auction ID' });
        return;
      }

      const auctionData = activeAuctions.get(auctionId);
      const auction = await Product.findById(auctionId);
      if (!auction) {
        callback({ success: false, error: 'Auction not found' });
        return;
      }

      const Timenow = new Date();
      if (Timenow > new Date(auction.auctionEndDate)) {
        callback({ success: false, error: 'Auction has ended' });
        return;
      }

      console.log(auction.currentBid, bidAmount);
      if (bidAmount <= auction.currentBid) {
        callback({ success: false, error: 'Bid must be higher than current bid' });
        return;
      }

      const newManualBid = await BidsManager.createManualBid(auctionId, socket.userId, bidAmount, session);
      const autoBidResult = await BidsManager.processAutoBids(auctionId, bidAmount, socket.userId, session);

      await session.commitTransaction();
      transactionCommitted = true;

      callback({ success: true, bidId: newManualBid._id, amount: bidAmount });

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

      const nowTime = new Date();
      const endTime = new Date(auctionData.endTime);
      const timeLeftMs = endTime - nowTime;

      if (timeLeftMs > 0 && timeLeftMs < 5 * 60 * 1000) {
        const newEndTime = new Date(endTime.getTime() + 5 * 60 * 1000);
        auctionData.endTime = newEndTime;
        activeAuctions.set(auctionId, auctionData);

        await Product.findByIdAndUpdate(auctionId, {
          auctionEndTime: newEndTime,
          $inc: { auctionExtensionCount: 1 }
        });

        io.to(auctionId).emit('auction-extended', { endTime: newEndTime.toISOString() });
      }

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

  socket.on('auction-timer', async (data) => {
    const now = Date.now();
    const lastBroadcast = lastBroadcastTime.get(`timer:${data.auctionId}`) || 0;

    if (!rateLimiter.isAllowed(socket.userId, 'auction-timer', data.auctionId)) {
      return;
    }

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

              await Product.findByIdAndUpdate(data.auctionId, {
                currentBid: winningBidAmount,
                currentBidder: winnerId,
                status: "sold"
              });

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
                currentBidder: winnerId ? { id: winnerId, name: winnerName } : null,
                endTime: auctionData.endTime,
                participants: auctionData.participants || 0,
                recentBids: auctionData.recentBids || []
              };

              console.log('📢 Broadcasting final results to all clients:', finalResults);
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

  socket.on('leave-auction', (auctionId) => {
    if (!rateLimiter.isAllowed(socket.userId, 'leave-auction', auctionId)) {
      return;
    }
    handleLeaveAuction(socket, auctionId);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId} (Socket ID: ${socket.id})`);

    if (userSocketsMap.has(socket.userId)) {
      userSocketsMap.get(socket.userId).delete(socket.id);

      if (userSocketsMap.get(socket.userId).size === 0) {
        userSocketsMap.delete(socket.userId);

        if (userAuctions.has(socket.userId)) {
          const userRooms = userAuctions.get(socket.userId);
          for (const auctionId of userRooms) {
            handleParticipantLeave(socket.userId, auctionId);
          }
          userAuctions.delete(socket.userId);
        }

        for (const [key] of userBidThrottle.entries()) {
          if (key.startsWith(`${socket.userId}:`)) {
            userBidThrottle.delete(key);
          }
        }
      }
    }
  });
}

function handleLeaveAuction(socket, auctionId) {
  if (userAuctions.has(socket.userId) && userAuctions.get(socket.userId).has(auctionId)) {
    userAuctions.get(socket.userId).delete(auctionId);
    socket.leave(auctionId);

    const userHasOtherSocketsInAuction = Array.from(io.sockets.sockets.values())
      .some(s => s.id !== socket.id && s.userId === socket.userId && s.rooms.has(auctionId));

    if (!userHasOtherSocketsInAuction) {
      handleParticipantLeave(socket.userId, auctionId);
    }
  }
}

function handleParticipantLeave(userId, auctionId) {
  const auctionData = activeAuctions.get(auctionId);
  if (auctionData) {
    auctionData.participants = Math.max(0, auctionData.participants - 1);
    activeAuctions.set(auctionId, auctionData);

    const now = Date.now();
    const lastBroadcast = lastBroadcastTime.get(`participants:${auctionId}`) || 0;

    if (now - lastBroadcast > BROADCAST_THROTTLE) {
      io.to(auctionId).emit('participant-update', { count: auctionData.participants });
      lastBroadcastTime.set(`participants:${auctionId}`, now);
    }
  }
}

module.exports = {
  initializeHandlers,
  registerSocketHandlers
};
