// middleware/formRateLimit.js
//
// Small in-memory per-IP limiter for public lead forms (/buyer-list,
// /new-deals). Stops a script from flooding the form — and, on /new-deals,
// from triggering a stream of Maya calls. Per process: fine for one Render
// instance; swap for a shared store if the API is ever scaled out.

const buckets = new Map(); // ip → [timestamps]

const clientIp = (req) =>
  String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "unknown";

/**
 * @param {object} [opts]
 * @param {number} [opts.max=5]           submissions allowed per window
 * @param {number} [opts.windowMs=600000] window length (default 10 minutes)
 */
const formRateLimit = ({ max = 5, windowMs = 10 * 60 * 1000 } = {}) => (req, res, next) => {
  const now = Date.now();
  const ip = clientIp(req);
  const recent = (buckets.get(ip) || []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    buckets.set(ip, recent);
    return res.status(429).json({
      success: false,
      message: "Too many submissions. Please wait a few minutes and try again.",
    });
  }

  recent.push(now);
  buckets.set(ip, recent);

  // Keep the map from growing forever.
  if (buckets.size > 5000) {
    for (const [key, times] of buckets) {
      if (!times.some((t) => now - t < windowMs)) buckets.delete(key);
    }
  }
  next();
};

module.exports = formRateLimit;
