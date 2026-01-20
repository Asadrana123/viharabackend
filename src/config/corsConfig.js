// corsConfig.js - Centralized CORS configuration

const allowedOrigins = [
  "https://www.vihara.ai",
  "https://vihara-new-website-git-testing-nodifys-projects.vercel.app",
  "http://localhost:3000",
  "https://vihara-new-website-nodifys-projects.vercel.app"
];

// CORS options for Express
const expressCorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// CORS options for Socket.IO
const socketIOCorsOptions = {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
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
