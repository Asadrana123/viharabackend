// utils/queryTimeoutWrapper.js

/**
 * Wraps MongoDB queries with timeout handling
 * @param {Promise} query - MongoDB query promise
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @returns {Promise} - Query result or timeout error
 */
const withTimeout = (query, timeoutMs = 5000) => {
  return Promise.race([
    query,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

module.exports = withTimeout;
