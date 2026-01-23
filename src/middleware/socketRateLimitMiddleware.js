// utils/socketRateLimitMiddleware.js

/**
 * Socket.IO Rate Limiting Middleware
 * Handles rate limiting for all socket events with configurable limits per event
 */

class SocketRateLimitMiddleware {
  constructor() {
    // Store throttle times for each user:event:context combination
    this.throttles = new Map();
    
    // Define rate limits for each event (in milliseconds)
    this.eventLimits = {
      'join-auction': 1000,        // 1 request per 1 second
      'leave-auction': 1000,       // 1 request per 1 second
      'auction-timer': 500,        // 2 requests per 1 second
      'place-bid': 2000,           // Already handled separately, but included for completeness
      'disconnect': 0,             // No limit
      'connect': 0                 // No limit
    };

    // Global connection limits
    this.userConnections = new Map();
    this.MAX_CONNECTIONS_PER_USER = 5;
  }

  /**
   * Check if event should be rate limited
   * @param {string} userId - User ID
   * @param {string} eventName - Event name (join-auction, place-bid, etc)
   * @param {string} context - Additional context like auctionId
   * @returns {boolean} - true if allowed, false if rate limited
   */
  isAllowed(userId, eventName, context = null) {
    const limit = this.eventLimits[eventName];
    
    // If event has no limit, always allow
    if (limit === 0) {
      return true;
    }

    // Generate unique key for this user:event:context
    const key = context 
      ? `${userId}:${eventName}:${context}` 
      : `${userId}:${eventName}`;

    const now = Date.now();
    const lastTime = this.throttles.get(key) || 0;

    // Check if enough time has passed
    if (now - lastTime < limit) {
      return false; // Rate limited
    }

    // Update last time and allow
    this.throttles.set(key, now);
    return true;
  }

  /**
   * Check connection limit for user
   * @param {string} userId - User ID
   * @returns {boolean} - true if user can connect, false if limit exceeded
   */
  canConnect(userId) {
    const connections = this.userConnections.get(userId) || 0;
    return connections < this.MAX_CONNECTIONS_PER_USER;
  }

  /**
   * Increment connection count
   * @param {string} userId - User ID
   */
  addConnection(userId) {
    const current = this.userConnections.get(userId) || 0;
    this.userConnections.set(userId, current + 1);
  }

  /**
   * Decrement connection count
   * @param {string} userId - User ID
   */
  removeConnection(userId) {
    const current = this.userConnections.get(userId) || 0;
    if (current > 0) {
      this.userConnections.set(userId, current - 1);
    }
  }

  /**
   * Cleanup old throttle entries (run periodically)
   * Remove entries older than 1 hour to prevent memory leak
   */
  cleanup() {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (const [key, time] of this.throttles.entries()) {
      if (now - time > ONE_HOUR) {
        this.throttles.delete(key);
      }
    }
  }

  /**
   * Update rate limit for specific event
   * @param {string} eventName - Event name
   * @param {number} limitMs - Limit in milliseconds
   */
  setEventLimit(eventName, limitMs) {
    this.eventLimits[eventName] = limitMs;
  }

  /**
   * Get all event limits
   * @returns {object} - Object with event limits
   */
  getEventLimits() {
    return { ...this.eventLimits };
  }

  /**
   * Get connection count for a user
   * @param {string} userId - User ID
   * @returns {number} - Number of active connections
   */
  getConnectionCount(userId) {
    return this.userConnections.get(userId) || 0;
  }
}

// Create singleton instance
const rateLimiter = new SocketRateLimitMiddleware();

// Cleanup old entries every hour
setInterval(() => {
  rateLimiter.cleanup();
}, 60 * 60 * 1000);

module.exports = rateLimiter;