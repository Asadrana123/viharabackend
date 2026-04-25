# Vihara Backend

Backend API server for **Vihara** — a real estate auction platform with real-time bidding, AI-powered renovation visualization, and automated investment analysis.

Built with Node.js, Express, MongoDB, and Socket.IO.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the Server](#running-the-server)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
  - [Authentication & User Management](#1-authentication--user-management)
  - [Property Management](#2-property-management)
  - [Auction Registration](#3-auction-registration)
  - [Manual Bidding](#4-manual-bidding)
  - [Auto Bidding](#5-auto-bidding)
  - [Real-Time Auction Engine (Socket.IO)](#6-real-time-auction-engine-socketio)
  - [Investment Calculator](#7-investment-calculator)
  - [AI Renovation Visualization](#8-ai-renovation-visualization)
  - [Renovation Cost Estimation](#9-renovation-cost-estimation)
  - [Communication & Email](#10-communication--email)
  - [Admin Panel](#11-admin-panel)
- [API Reference](#api-reference)
  - [User Routes](#user-routes)
  - [Product Routes](#product-routes)
  - [Auction Registration Routes](#auction-registration-routes)
  - [Bidding Routes](#bidding-routes)
  - [Investment Calculator Routes](#investment-calculator-routes)
  - [Renovation Routes](#renovation-routes)
  - [Other Routes](#other-routes)
- [Real-Time Events (Socket.IO)](#real-time-events-socketio)
- [Data Models](#data-models)
- [Authentication & Authorization](#authentication--authorization)
- [Error Handling](#error-handling)
- [External Services & Integrations](#external-services--integrations)
- [Performance & Rate Limiting](#performance--rate-limiting)
- [CORS Configuration](#cors-configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture Overview

The application follows a **Model-View-Controller (MVC)** pattern with a service layer for external API integrations and a dedicated Socket.IO layer for real-time auction functionality.

```
Client (React Frontend)
    │
    ├── HTTP Requests ──► Express API
    │                       ├── Routes (endpoint definitions)
    │                       ├── Middleware (auth, error handling)
    │                       ├── Controllers (request/response logic)
    │                       ├── Services (external API calls, AI)
    │                       └── Models (MongoDB via Mongoose)
    │
    └── WebSocket ──────► Socket.IO Server
                            ├── Authentication (JWT via cookies)
                            ├── Rate Limiting
                            ├── Socket Handlers (bid, timer, join/leave)
                            └── BidsManager (auto-bid processing)
```

**Request lifecycle:**

1. Client sends HTTP request or WebSocket event
2. CORS middleware validates the origin
3. Authentication middleware verifies JWT token from httpOnly cookie
4. Route handler delegates to the appropriate controller
5. Controller calls services/models as needed
6. Response returned (or Socket.IO event broadcast to auction room)

---

## Technology Stack

| Category | Technology |
|:---|:---|
| **Runtime** | Node.js |
| **Framework** | Express.js 4.x |
| **Database** | MongoDB (Mongoose 8.x ODM) |
| **Real-Time** | Socket.IO 4.x |
| **Authentication** | JWT (jsonwebtoken) + Passport.js (Google OAuth2) |
| **Password Hashing** | bcryptjs |
| **AI / ML** | Google Gemini AI (`@google/generative-ai`), Replicate |
| **Real Estate APIs** | ATTOM Data Solutions, CoreLogic |
| **Image Storage** | Cloudinary |
| **Email** | Nodemailer, SendGrid, Resend |
| **SMS** | Twilio |
| **Validation** | validator.js |
| **CSV Parsing** | PapaParse |
| **Dev Tooling** | nodemon |

---

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **MongoDB** instance (local or Atlas cluster)
- API keys for external services (see [Environment Variables](#environment-variables))

### Installation

```bash
git clone https://github.com/Asadrana123/viharabackend.git
cd viharabackend
npm install
```

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Server
PORT=8000

# MongoDB
DB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>

# JWT
secret=your_jwt_secret_key
expireTime=7d

# Google OAuth2
CLIENT_ID=your_google_client_id
CLIENT_SECRET=your_google_client_secret

# ATTOM Data Solutions
ATTOM_API_KEY=your_attom_api_key

# CoreLogic
CORELOGIC_CONSUMER_KEY=your_corelogic_key
CORELOGIC_CONSUMER_SECRET=your_corelogic_secret

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Replicate (AI image generation)
REPLICATE_API_TOKEN=your_replicate_token

# Cloudinary (image storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret

# Email (Nodemailer)
EMAIL_USERNAME=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# SendGrid (optional)
SENDGRID_API_KEY=your_sendgrid_key

# Twilio (optional, for SMS/OTP)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

### Running the Server

```bash
# Development (with hot-reload via nodemon)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:8000` by default (configurable via `PORT`).

A health-check endpoint is available at `GET /` which returns `"Server is running!"`.

---

## Project Structure

```
viharabackend/
├── src/
│   ├── index.js                  # Entry point — HTTP server + Socket.IO init
│   ├── app.js                    # Express app setup, routes, MongoDB connection
│   ├── passport.js               # Google OAuth2 strategy configuration
│   │
│   ├── config/
│   │   ├── corsConfig.js         # CORS settings for Express & Socket.IO
│   │   ├── renovationConstants.js        # Replicate model config
│   │   └── renovationContractorConstants.js
│   │
│   ├── controller/
│   │   ├── userController.js             # User registration, login, profile
│   │   ├── adminController.js            # Admin operations
│   │   ├── productController.js          # Property CRUD
│   │   ├── manualBiddingController.js    # Manual bid placement
│   │   ├── autoBiddingController.js      # Auto-bid settings
│   │   ├── auctionRegistrationController.js  # Auction registration
│   │   ├── investmentCalculatorController.js # Investment data orchestration
│   │   ├── coreLogicController.js        # CoreLogic API proxy
│   │   ├── renovationController.js       # AI renovation endpoints
│   │   ├── contactController.js          # Contact form submissions
│   │   ├── sellingController.js          # Sell-property form
│   │   ├── demoGraphicController.js      # Demographic data
│   │   ├── eBookRequestController.js     # E-book download requests
│   │   ├── landingPageLeadController.js  # Landing page lead capture
│   │   ├── otpController.js              # OTP verification
│   │   ├── savedSearchController.js      # Saved search management
│   │   └── userPreferencesController.js  # User preferences
│   │
│   ├── model/
│   │   ├── userModel.js              # User schema (auth, profile, saved properties)
│   │   ├── adminModel.js             # Admin schema
│   │   ├── productModel.js           # Property/auction schema (comprehensive)
│   │   ├── manualBiddingModel.js     # Manual bid records
│   │   ├── autoBiddingModel.js       # Auto-bid configuration
│   │   ├── auctionRegistration.js    # Auction registration records
│   │   ├── contactUSModel.js         # Contact form submissions
│   │   ├── sellingModel.js           # Sell-property submissions
│   │   ├── savedSearch.js            # Saved search criteria
│   │   ├── userPreferencesModel.js   # User preference settings
│   │   ├── renovationRequestModel.js # Renovation request tracking
│   │   ├── EBookModel.js             # E-book request records
│   │   ├── formDataModel.js          # Generic form data
│   │   ├── landingPageLeadModel.js   # Landing page leads
│   │   └── unsubscribeModel.js       # Email unsubscribe records
│   │
│   ├── routes/
│   │   ├── userRoutes.js             # /api/v1/user/*
│   │   ├── adminRoutes.js            # /api/v1/admin/*
│   │   ├── productRoutes.js          # /api/v1/product/*
│   │   ├── biddingRoutes.js          # /api/bidding/*
│   │   ├── auctionRegistrationRoutes.js  # /api/auction-registration/*
│   │   ├── investmentCalculatorRoutes.js # /api/v1/investment-calculator/*
│   │   ├── coreLogicRoutes.js        # /api/v1/corelogic/*
│   │   ├── renovationRoutes.js       # /api/property-renovation/*
│   │   ├── auth.js                   # /auth/* (Google OAuth)
│   │   ├── contactRoutes.js          # /api/saveContact/*
│   │   ├── sellPropertyRoutes.js     # /api/sellProperty/*
│   │   ├── savedSearch.js            # /api/user/save-searches/*
│   │   ├── demoGraphicRoutes.js      # /api/v1/demographics/*
│   │   ├── eBookRoutes.js            # /api/ebook/*
│   │   ├── userPreferencesRoutes.js  # /api/v1/user/* (preferences)
│   │   ├── unsubscribeRoutes.js      # /api/* (unsubscribe)
│   │   └── landingPageLeadRoutes.js  # /api/landing/*
│   │
│   ├── services/
│   │   ├── attomService.js               # ATTOM API (valuation, rental, tax, comps)
│   │   ├── coreLogicService.js           # CoreLogic API (property data, OAuth)
│   │   ├── geminiRenovationService.js    # Google Gemini AI (cost estimation, contractors)
│   │   ├── geminiPromptBuilder.js        # Prompt construction for Gemini
│   │   ├── geminiService.js              # General Gemini AI service
│   │   ├── renovationCostService.js      # Renovation cost calculation logic
│   │   ├── renovationContractorService.js # Contractor lookup service
│   │   ├── replicateService.js           # Replicate AI (image generation)
│   │   └── replicatePromptBuilder.js     # Prompt construction for Replicate
│   │
│   ├── socket/
│   │   ├── socketServer.js           # Socket.IO server init, auth middleware, cleanup
│   │   ├── socketHandlers.js         # Event handlers (join, bid, timer, leave)
│   │   └── getIoInstance.js          # Singleton accessor for io instance
│   │
│   ├── middleware/
│   │   ├── auth.js                   # JWT verification + role authorization
│   │   ├── catchAsyncError.js        # Async error wrapper for controllers
│   │   ├── error.js                  # Global error handler
│   │   └── socketRateLimitMiddleware.js  # Socket.IO rate limiting
│   │
│   ├── utils/
│   │   ├── bidsManager.js            # Bid creation, auto-bid processing, min-bid calc
│   │   ├── sendEmail.js              # Nodemailer email sender
│   │   ├── emailTemplates.js         # HTML email template builders
│   │   ├── errorhandler.js           # Custom Error class
│   │   ├── getToken.js               # JWT token helper
│   │   ├── cookieOptions.js          # Cookie configuration
│   │   ├── stateAbbreviations.js     # US state abbreviation mappings
│   │   ├── queryTimeoutWrapper.js    # MongoDB query timeout utility
│   │   └── generateDummyData.js      # Test data generator
│   │
│   ├── htmlPages/
│   │   ├── viharaEmailTemplate.js        # Branded email template
│   │   ├── newsLetterTemplate.js         # Newsletter HTML
│   │   ├── happyNewYearTemplate.js       # Holiday email template
│   │   ├── successPage.js                # Unsubscribe success page
│   │   ├── alreadyUnsubscribedPage.js    # Already unsubscribed page
│   │   └── errorPage.js                  # Error page
│   │
│   └── data/
│       ├── Counties.json             # US county reference data
│       └── dummyUsers.json           # Seed/test user data
│
├── package.json
├── BACKEND_README.md                 # Legacy internal documentation
└── .gitignore
```

---

## Core Features

### 1. Authentication & User Management

**Controller:** `src/controller/userController.js`
**Model:** `src/model/userModel.js`

- User registration with email validation (validator.js)
- Password hashing with bcryptjs (10 salt rounds)
- JWT token generation stored in httpOnly cookies
- Google OAuth2 login via Passport.js (`src/passport.js`)
- Password reset flow with crypto tokens (15-minute expiry)
- Profile updates, saved properties management
- GDPR-compliant data export and soft-delete account functionality
- Two user types: `Buyer` and `Agent`; two roles: `user` and `admin`

**Registration flow:**
```
POST /api/v1/user/registerUser
  → Validate email uniqueness
  → Hash password (bcrypt, 10 rounds)
  → Create user in MongoDB
  → Generate JWT token
  → Set httpOnly cookie
  → Return user data
```

### 2. Property Management

**Controller:** `src/controller/productController.js`
**Model:** `src/model/productModel.js`

Properties are the central entity, representing auction listings with comprehensive data:

- **Core fields:** name, address (street/city/county/state/zip), beds, baths, sqft, lot size, year built
- **Auction fields:** start bid, current bid, current bidder, reserve price, min increment, EMD, commission, start/end dates and times, status (`active`/`sold`/`cancelled`/`pending`)
- **Property details:** interior (bedrooms, bathrooms, heating, cooling, features), exterior (parking, lot features, construction), community info, HOA
- **Investment data:** valuation, rental estimates, tax data, comparables, price/tax history
- **Market insights:** median prices, days on market, trends
- **Location:** coordinates (parcel/block/city level from CoreLogic), walk/transit/bike scores
- **Media:** primary image, additional images, 3D tour ID and metadata
- **Listing agent:** name, company, phone, email, license number

### 3. Auction Registration

**Controller:** `src/controller/auctionRegistrationController.js`
**Model:** `src/model/auctionRegistration.js`

Users must register for an auction before they can bid. The flow:

1. User submits registration with buyer info (individual or company)
2. Legal agreements are recorded (terms, inspection acknowledgment, etc.)
3. Registration created with `status: 'pending'`
4. Admin reviews and approves/rejects
5. Approval email sent to user
6. User can now join the auction room and place bids

### 4. Manual Bidding

**Controller:** `src/controller/manualBiddingController.js`
**Model:** `src/model/manualBiddingModel.js`

- Place bids via REST API or Socket.IO
- Validates: user is registered, auction is active, bid exceeds current bid
- Creates bid record in MongoDB
- Updates product's `currentBid` and `currentBidder`
- Broadcasts update to all connected clients via Socket.IO
- Triggers auto-bid processing for competing auto-bidders

### 5. Auto Bidding

**Controller:** `src/controller/autoBiddingController.js`
**Model:** `src/model/autoBiddingModel.js`

- Users configure a maximum bid amount and increment
- When a manual bid is placed, the system checks all active auto-bids for that auction
- The highest eligible auto-bidder automatically counter-bids
- Bids are capped at the user's configured `maxAmount`
- Auto-bidding can be enabled/disabled per auction

### 6. Real-Time Auction Engine (Socket.IO)

**Server:** `src/socket/socketServer.js`
**Handlers:** `src/socket/socketHandlers.js`
**Bids Manager:** `src/utils/bidsManager.js`

The real-time engine manages live auctions with:

- **JWT authentication** via cookie extraction on WebSocket handshake
- **In-memory auction state** (`Map`) for active auctions — current bid, bidder, participants, recent bids, end time, status
- **Sniping protection:** if a bid is placed within the last 5 minutes, the auction is automatically extended by 5 minutes
- **MongoDB transactions** for bid placement (atomic bid creation + auto-bid processing)
- **Admin observer mode:** admins can join auctions without incrementing participant count
- **Periodic cleanup:** ended auctions removed from memory after 3 hours; active auction data synced to database every 2 minutes
- **Bid throttling:** 2-second cooldown between bids per user per auction

### 7. Investment Calculator

**Controller:** `src/controller/investmentCalculatorController.js`
**Service:** `src/services/attomService.js`

Fetches and aggregates property investment data from ATTOM Data Solutions:

- **Property valuation** (Automated Valuation Model) — estimated value, confidence score, high/low range
- **Rental estimates** — monthly/annual rent, rent range
- **Comparable sales** — recent nearby sales with price, sqft, beds/baths
- **Tax/assessment data** — annual tax, assessed value, land vs. improvement value

Data is fetched in parallel where possible, with the property ID lookup as a prerequisite for comparable sales.

### 8. AI Renovation Visualization

**Service:** `src/services/replicateService.js`
**Prompt Builder:** `src/services/replicatePromptBuilder.js`

Uses Replicate's image-to-image AI models to generate photorealistic renovation visualizations:

1. Takes an original property photo (from Cloudinary)
2. Applies a detailed renovation prompt
3. Generates a transformed image
4. Uploads the result to Cloudinary for permanent storage
5. Returns the new image URL with a description

### 9. Renovation Cost Estimation

**Service:** `src/services/geminiRenovationService.js`
**Service:** `src/services/renovationCostService.js`

Uses Google Gemini AI to provide:

- **Itemized renovation costs** by area (Kitchen, Bathroom, Bedroom, Living Room, Exterior) and budget tier (Budget-Friendly, Mid-Range, Premium, Luxury)
- **Regional cost factors** adjusted for the property's city/state
- **ROI recovery percentages** for each line item
- **Local contractor recommendations** with real business names, phone numbers, ratings, and specialties

### 10. Communication & Email

**Utility:** `src/utils/sendEmail.js`
**Templates:** `src/utils/emailTemplates.js`, `src/htmlPages/`

- Transactional emails via Nodemailer (Gmail) and SendGrid
- Branded HTML email templates for auction notifications, registration confirmations, password resets
- Newsletter templates and holiday campaigns
- Unsubscribe management with dedicated HTML pages

### 11. Admin Panel

**Controller:** `src/controller/adminController.js`
**Routes:** `src/routes/adminRoutes.js`

- View and manage all auction registrations
- Approve/reject registration requests
- Create and manage property listings
- Admin-only routes protected by `authorizeRoles('admin')` middleware

---

## API Reference

### User Routes

| Method | Endpoint | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/api/v1/user/registerUser` | No | Register a new user |
| `POST` | `/api/v1/user/login` | No | Login and receive JWT cookie |
| `GET` | `/api/v1/user/get` | Yes | Get current user profile |
| `PUT` | `/api/v1/user/update/:userId` | Yes | Update user profile |
| `POST` | `/api/v1/user/forgot/password` | No | Request password reset |
| `POST` | `/api/v1/user/password/reset` | No | Reset password with token |
| `GET` | `/api/v1/user/logout` | Yes | Logout and clear cookie |

### Product Routes

| Method | Endpoint | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/api/v1/product/create` | Admin | Create a property listing |
| `GET` | `/api/v1/product/get` | No | Get all properties |
| `GET` | `/api/v1/product/:id` | No | Get property details |

### Auction Registration Routes

| Method | Endpoint | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/api/auction-registration` | Yes | Submit auction registration |
| `GET` | `/api/auction-registration/status` | Yes | Check registration status |
| `GET` | `/api/auction-registration/user/registrations` | Yes | Get user's registrations |

### Bidding Routes

| Method | Endpoint | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/api/bidding/manual-bid` | Yes | Place a manual bid |
| `GET` | `/api/bidding/manual-bid/history/:auctionId` | Yes | Get bid history for auction |
| `GET` | `/api/bidding/manual-bid/user-history` | Yes | Get user's bid history |
| `GET` | `/api/bidding/manual-bid/status` | Yes | Get current bidding status |
| `GET` | `/api/bidding/auction/check-access/:id` | Yes | Check auction access |
| `POST` | `/api/bidding/auto-bidding/settings` | Yes | Save auto-bid settings |
| `GET` | `/api/bidding/auto-bidding/settings/:id` | Yes | Get auto-bid settings |
| `GET` | `/api/bidding/auto-bidding/info/:id` | Yes | Get auto-bid info |
| `DELETE` | `/api/bidding/auto-bidding/settings/:id` | Yes | Disable auto-bidding |

### Investment Calculator Routes

| Method | Endpoint | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/api/v1/investment-calculator/:id` | No | Get all investment data |
| `GET` | `/api/v1/investment-calculator/:id/valuation` | No | Get valuation only |
| `GET` | `/api/v1/investment-calculator/:id/rental` | No | Get rental estimate |
| `GET` | `/api/v1/investment-calculator/:id/comparables` | No | Get comparable sales |

### Renovation Routes

| Method | Endpoint | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/api/property-renovation` | Yes | Generate renovation visualization |

### Other Routes

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/auth/google` | Initiate Google OAuth2 login |
| `GET` | `/auth/google/callback` | Google OAuth2 callback |
| `POST` | `/api/saveContact` | Submit contact form |
| `POST` | `/api/sellProperty` | Submit sell-property form |
| `GET` | `/api/v1/demographics/*` | Demographic data endpoints |
| `POST` | `/api/ebook/*` | E-book request endpoints |
| `GET` | `/api/v1/corelogic/*` | CoreLogic property data |
| `POST` | `/api/landing/*` | Landing page lead capture |

---

## Real-Time Events (Socket.IO)

### Client → Server

| Event | Payload | Description |
|:---|:---|:---|
| `join-auction` | `auctionId` | Join an auction room |
| `place-bid` | `{ auctionId, bidAmount }` | Place a bid (with acknowledgment callback) |
| `auction-timer` | `{ auctionId, timeLeft }` | Sync auction timer |
| `leave-auction` | `auctionId` | Leave an auction room |

### Server → Client

| Event | Payload | Description |
|:---|:---|:---|
| `auction-status` | Full auction state object | Sent on join — current bid, bidder, participants, recent bids, end time |
| `bid-update` | `{ currentBid, currentBidder, timestamp, isAutoBid }` | Broadcast when a new bid is placed |
| `participant-update` | `{ count }` | Broadcast when participant count changes |
| `auction-extended` | `{ endTime }` | Broadcast when auction is extended (sniping protection) |
| `auction-ended` | `{ hasWinner, winningBid, winnerName, ... }` | Broadcast when auction timer reaches zero |
| `min-bid-update` | Bid limit object | Broadcast after each bid with updated minimum bid requirements |
| `auction-error` | Error message string | Sent to individual client on error |

---

## Data Models

### User (`src/model/userModel.js`)

| Field | Type | Description |
|:---|:---|:---|
| `name` | String | First name (2-30 chars) |
| `last_name` | String | Last name |
| `email` | String | Unique, validated email |
| `password` | String | Bcrypt-hashed, excluded from queries by default |
| `userType` | Enum | `Buyer` or `Agent` |
| `role` | Enum | `user` or `admin` |
| `savedProperties` | ObjectId[] | References to saved product listings |
| `consents` | Object | GDPR data processing consent tracking |
| `resetPasswordToken` | String | Hashed password reset token |
| `resetPasswordExpire` | Date | Token expiry (15 minutes) |

### Product (`src/model/productModel.js`)

The most comprehensive model with 400+ lines covering:

- Core auction fields (bids, dates, reserve, EMD, commission)
- Property details (interior, exterior, community)
- Investment data (valuation, rental, tax, comparables, price/tax history)
- Market insights and area statistics
- Schools and walk scores
- Coordinates with source tracking (parcel/block/city)
- Listing agent information
- 3D tour metadata

### Manual Bid (`src/model/manualBiddingModel.js`)

| Field | Type | Description |
|:---|:---|:---|
| `auctionId` | ObjectId | Reference to the product/auction |
| `userId` | ObjectId | Reference to the bidding user |
| `amount` | Number | Bid amount in USD |
| `createdAt` | Date | Timestamp |

### Auto Bidding (`src/model/autoBiddingModel.js`)

| Field | Type | Description |
|:---|:---|:---|
| `userId` | ObjectId | Reference to the user |
| `auctionId` | ObjectId | Reference to the auction |
| `enabled` | Boolean | Whether auto-bidding is active |
| `maxAmount` | Number | Maximum bid ceiling |
| `increment` | Number | Bid increment amount |

### Auction Registration (`src/model/auctionRegistration.js`)

| Field | Type | Description |
|:---|:---|:---|
| `userId` | ObjectId | Reference to the user |
| `auctionId` | ObjectId | Reference to the auction |
| `buyerType` | Enum | `individual` or `company` |
| `buyerInfo` | Object | Name, email, address details |
| `companyInfo` | Object | Company name, entity type, tax ID |
| `legalAgreements` | Object | Terms acceptance flags |
| `status` | Enum | `pending`, `approved`, or `rejected` |

---

## Authentication & Authorization

### JWT Token Flow

```
1. User logs in (POST /api/v1/user/login)
2. Server validates credentials
3. JWT token generated with { id, role } payload
4. Token set as httpOnly cookie
5. All subsequent requests include cookie automatically
6. auth.js middleware extracts and verifies token
7. User object attached to req.user
```

### Middleware

- **`isAuthenticated`** — Verifies JWT token from cookies, attaches user to request
- **`authorizeRoles(...roles)`** — Checks if authenticated user has the required role

```javascript
// Example: Admin-only route
router.post('/create', isAuthenticated, authorizeRoles('admin'), createProduct);
```

### Google OAuth2

Configured in `src/passport.js` using `passport-google-oauth20`:

- Callback URL: `/auth/google/callback`
- Creates new user or updates existing user on login
- Generates JWT token and sets cookie on successful authentication

---

## Error Handling

The error handling pipeline flows through three layers:

1. **`catchAsyncError`** (`src/middleware/catchAsyncError.js`) — Wraps async controller functions to catch rejected promises
2. **`Errorhandler`** (`src/utils/errorhandler.js`) — Custom error class with `statuscode` and `message`
3. **Global error middleware** (`src/middleware/error.js`) — Catches all errors and returns standardized JSON responses

**Handled error types:**
- `CastError` — Invalid MongoDB ObjectId (400)
