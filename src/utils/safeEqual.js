// utils/safeEqual.js
//
// Compares a secret someone sent with the real one in constant time, so the
// answer time doesn't reveal how many characters matched. Both sides are hashed
// first so timingSafeEqual always gets equal-length buffers (same approach as
// middleware/qaAgentAuth.js). An empty or missing secret never matches.
const crypto = require("crypto");

const safeEqual = (given, expected) => {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
};

module.exports = { safeEqual };
