// corsConfig.js - Centralized CORS configuration
const Errorhandler = require("../utils/errorhandler");

const allowedOrigins = [
  "https://www.vihara.ai",
"https://vihara-new-website-ahudtv10w-nodifys-projects.vercel.app",
"https://vihara-new-website-git-feature-task-nodifys-projects.vercel.app",
  "http://localhost:3000",
  "https://vihara-new-website-nodifys-projects.vercel.app"
];

// Every Vercel preview of the website (one per design-agent change) gets its
// own address. Allow any preview from our own Vercel team, and nothing else.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/vihara-new-website-[a-z0-9-]+-nodifys-projects\.vercel\.app$/;

const isAllowedOrigin = (origin) =>
  !origin || allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin);

// CORS options for Express
const expressCorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      // Name the origin so blocked callers can be identified in the logs.
      callback(new Errorhandler(`CORS not allowed for origin ${origin}`, 403));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// CORS options for Socket.IO
const socketIOCorsOptions = {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS not allowed for origin ${origin}`));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 5000,     // ← 5 seconds (detect dead connection)
  pingInterval: 2000     // ← 2 seconds (check every 2 seconds)
};

module.exports = {
  allowedOrigins,
  expressCorsOptions,
  socketIOCorsOptions
};
