// corsConfig.js - Centralized CORS configuration
const Errorhandler = require("../utils/errorhandler");

// Sites whose requests may use the visitor's login cookie: the live website and
// the website running locally (kept in production too, by team decision).
const allowedOrigins = [
  "https://www.vihara.ai",
  "http://localhost:3000",
];

// Every Vercel preview of the website (one per branch / design-agent change)
// gets its own address. Previews are only used to look at public pages, so they
// may call the API, but always as a logged-out visitor: their cookies are
// dropped before anything reads them (see dropPreviewCookies and the socket
// server). That way a look-alike address can never act as a signed-in user.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/(vihara-next|vihara-new-website)-[a-z0-9-]+-nodifys-projects\.vercel\.app$/;
const OLD_SITE_ORIGINS = [
  "https://vihara-new-website-nodifys-projects.vercel.app",
];

const isPreviewOrigin = (origin) =>
  Boolean(origin) && (VERCEL_PREVIEW_ORIGIN.test(origin) || OLD_SITE_ORIGINS.includes(origin));

const isAllowedOrigin = (origin) =>
  !origin || allowedOrigins.includes(origin) || isPreviewOrigin(origin);

// Express middleware, before cookie-parser: a request from a preview site is
// treated as logged out, and can't set cookies either.
const dropPreviewCookies = (req, res, next) => {
  if (isPreviewOrigin(req.headers.origin)) {
    delete req.headers.cookie;
    res.cookie = function () { return this; };
    res.clearCookie = function () { return this; };
  }
  next();
};

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
  isPreviewOrigin,
  dropPreviewCookies,
  expressCorsOptions,
  socketIOCorsOptions
};
