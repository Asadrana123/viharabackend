# Vihara AI - Backend API Documentation

Node.js/Express backend for real estate auction platform with real-time bidding, user management, and property analysis.

---

## 🏗️ Backend Architecture

```
Client (React)
    ↓
Express API
    ├── Routes (endpoints)
    ├── Controllers (request handling)
    ├── Services (business logic)
    └── Models (database)
    ↓
MongoDB
```

---

## 📂 Core Folder Structure

### **Routes** (`/routes`)
Define all API endpoints

- `userRoutes.js` - User authentication & profile
- `auctionRegistrationRoutes.js` - Auction registration
- `biddingRoutes.js` - Manual & auto bidding
- `productRoutes.js` - Property listings
- `investmentCalculatorRoutes.js` - Investment analysis
- `coreLogicRoutes.js` - CoreLogic API integration

---

### **Controllers** (`/controller`)
Handle HTTP requests and send responses

- `userController.js` - Login, signup, profile
- `auctionRegistrationController.js` - Auction registration
- `manualBiddingController.js` - Manual bids
- `autoBiddingController.js` - Auto bidding
- `productController.js` - Property CRUD
- `investmentCalculatorController.js` - Investment data
- `adminController.js` - Admin operations

---

### **Models** (`/model`)
MongoDB database schemas

- `userModel.js` - User data (name, email, password)
- `productModel.js` - Property data (address, beds, baths, etc)
- `manualBiddingModel.js` - Manual bids
- `autoBiddingModel.js` - Auto-bid settings
- `auctionRegistration.js` - Auction registrations
- `userPreferencesModel.js` - User preferences
- `renovationRequestModel.js` - Renovation requests

---

### **Services** (`/services`)
Business logic and external API calls

- `attomService.js` - ATTOM property data (valuation, rental)
- `coreLogicService.js` - CoreLogic property data
- `geminiService.js` - Google Gemini AI for renovations
- `renovationCostService.js` - Calculate renovation costs

---

### **Middleware** (`/middleware`)
Process requests before controllers

- `auth.js` - JWT authentication
- `catchAsyncError.js` - Error handling wrapper
- `error.js` - Global error handler
- `socketRateLimitMiddleware.js` - Socket.IO rate limiting

---

### **Socket** (`/socket`)
Real-time auction functionality

- `socketServer.js` - Socket.IO initialization
- `socketHandlers.js` - Event handlers (join, bid, timer)

---

## 🔑 Core Features Explained

### **1. User Authentication** (`userController.js`)

**What it does:**
- User registration with email validation
- Login with password hashing
- JWT token generation
- Password reset functionality
- User profile updates

**Key Endpoints:**
```
POST   /api/v1/user/registerUser     Create new user
POST   /api/v1/user/login             Login user
GET    /api/v1/user/get               Get user profile
PUT    /api/v1/user/update/:userId    Update profile
POST   /api/v1/user/forgot/password   Forgot password
POST   /api/v1/user/password/reset    Reset password
```

**Flow:**
1. User submits credentials
2. `userController.registerUser()` validates input
3. Password hashed with bcrypt
4. User saved to MongoDB
5. JWT token generated and sent in httpOnly cookie

---

### **2. Auction Registration** (`auctionRegistrationController.js`)

**What it does:**
- Register users for specific auctions
- Store buyer information (individual/company)
- Legal agreement tracking
- Admin approval workflow
- Email notifications

**Key Endpoints:**
```
POST   /api/auction-registration              Submit registration
GET    /api/auction-registration/status       Check registration status
GET    /api/auction-registration/user/registrations Get user registrations
GET    /api/v1/admin/auction-registrations    Get all registrations (admin)
PUT    /api/v1/admin/auction-registration/:id Update registration status (admin)
```

**Registration Flow:**
1. User fills registration form on PropertyDetail
2. `submitAuctionRegistration()` saves buyer info
3. Admin reviews and approves
4. User receives approval email
5. User can now bid on property

---

### **3. Manual Bidding** (`manualBiddingController.js`)

**What it does:**
- Place manual bids
- Validate bid amounts
- Track bid history
- Update current bid in real-time
- Check auction access control

**Key Endpoints:**
```
POST   /api/bidding/manual-bid                    Place manual bid
GET    /api/bidding/manual-bid/history/:auctionId Get bid history
GET    /api/bidding/manual-bid/user-history      Get user's bids
GET    /api/bidding/auction/check-access/:id     Check auction access
GET    /api/bidding/manual-bid/status             Get bidding status
```

**Bid Placement Flow:**
1. User clicks "Place Bid" in LiveAuctionRoom
2. `createManualBid()` validates:
   - User is registered for auction
   - Auction is active
   - Bid > current bid
3. ManualBid created and saved
4. Product currentBid updated
5. Socket broadcast to all users
6. Auto-bids processed if applicable

---

### **4. Auto Bidding** (`autoBiddingController.js`)

**What it does:**
- Set auto-bid limits and increments
- Automatically counter-bid
- Prevent users from overbidding limit
- Process auto-bids when manual bids placed

**Key Endpoints:**
```
POST   /api/bidding/auto-bidding/settings        Save auto-bid settings
GET    /api/bidding/auto-bidding/settings/:id    Get auto-bid settings
GET    /api/bidding/auto-bidding/info/:id        Get auto-bid info
DELETE /api/bidding/auto-bidding/settings/:id    Disable auto-bidding
```

**Auto-Bid Logic:**
1. User sets maxAmount and increment
2. When someone places higher bid:
   - Check all active auto-bids
   - Find highest auto-bid
   - Place bid = highest auto-bid max - next bid amount
   - Cap at user's maxAmount
3. Repeat until all auto-bids exhausted

---

### **5. Property Management** (`productController.js`)

**What it does:**
- Create property listings
- Retrieve all properties
- Store property details (location, specs, images)
- Track auction timeline

**Key Endpoints:**
```
POST   /api/v1/product/create  Create property (admin)
GET    /api/v1/product/get     Get all properties
GET    /api/v1/product/:id     Get property details
```

**Property Fields:**
- Address (street, city, state, zip)
- Physical specs (beds, baths, sqft, lot size)
- Auction info (start bid, reserve, dates)
- Images & 3D tour
- Investment data (valuation, rental, tax)

---

### **6. Investment Calculator** (`investmentCalculatorController.js`)

**What it does:**
- Fetch property valuation from ATTOM
- Get rental estimates
- Retrieve comparable sales
- Calculate ROI and tax estimates
- Display market insights

**Key Endpoints:**
```
GET    /api/v1/investment-calculator/:id         Get all investment data
GET    /api/v1/investment-calculator/:id/valuation Get valuation only
GET    /api/v1/investment-calculator/:id/rental  Get rental estimate
GET    /api/v1/investment-calculator/:id/comparables Get comparable sales
```

**Data Flow:**
1. User opens PropertyDetail
2. `getPropertyInvestmentData()` calls attomService
3. ATTOM API returns valuation, rental, tax data
4. Data formatted and returned to frontend
5. Investment calculator displays analysis

---

### **7. Real-Time Auction** (Socket.IO)

**What it does:**
- Real-time bid updates
- Live participant count
- Auction timer broadcasts
- Auction extension logic
- Winner determination

**Socket Events:**

**Client → Server:**
```javascript
socket.emit('join-auction', auctionId)
socket.emit('place-bid', { auctionId, amount })
socket.emit('auction-timer', { auctionId, timeLeft })
socket.emit('leave-auction', auctionId)
```

**Server → Client:**
```javascript
socket.emit('auction-status', auctionData)
socket.emit('bid-update', bidData)
socket.emit('participant-update', { count })
socket.emit('auction-extended', { endTime })
socket.emit('auction-ended', finalResults)
socket.emit('min-bid-update', bidLimits)
```

**Auction Timeline:**
1. User joins → `join-auction` event
2. Server authorizes user
3. Server sends current bid, bidders, recent bids
4. User places bid → `place-bid` event
5. Server validates and creates ManualBid
6. Server broadcasts `bid-update` to all
7. Auto-bids processed
8. When timer hits 0 → `auction-ended`
9. Winner determined and saved

---

## 🔄 Data Models

### **User Model** (`userModel.js`)
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  businessPhone: String,
  city: String,
  state: String,
  role: 'user' or 'admin',
  savedProperties: [ObjectId],
  consents: { dataProcessing: { granted, grantedAt } },
  createdAt: Date
}
```

### **Product Model** (`productModel.js`)
```javascript
{
  productName: String,
  street: String,
  city: String,
  state: String,
  zipCode: String,
  beds: Number,
  baths: Number,
  squareFootage: Number,
  propertyType: String,
  startBid: Number,
  currentBid: Number,
  currentBidder: ObjectId (User),
  auctionStartDate: Date,
  auctionEndDate: Date,
  auctionEndTime: String,
  image: String (URL),
  investmentData: {
    valuation: {},
    rental: {},
    taxData: {},
    comparables: []
  },
  coordinates: {
    parcel: { lat, lng },
    block: { lat, lng }
  }
}
```

### **Manual Bid Model** (`manualBiddingModel.js`)
```javascript
{
  auctionId: ObjectId,
  userId: ObjectId,
  amount: Number,
  createdAt: Date
}
```

### **Auto Bidding Model** (`autoBiddingModel.js`)
```javascript
{
  userId: ObjectId,
  auctionId: ObjectId,
  enabled: Boolean,
  maxAmount: Number,
  increment: Number,
  createdAt: Date
}
```

### **Auction Registration Model** (`auctionRegistration.js`)
```javascript
{
  userId: ObjectId,
  auctionId: ObjectId,
  buyerType: 'individual' or 'company',
  buyerInfo: { firstName, lastName, email, address, city, state, zipCode },
  companyInfo: { company, entityType, taxId },
  legalAgreements: { agreeToTerms, acknowledgeInspection, ... },
  status: 'pending' or 'approved' or 'rejected',
  submittedAt: Date
}
```

---

## 🔐 Authentication & Authorization

### JWT Token Flow

```
1. User logs in
   ↓
2. Server generates JWT token
   ↓
3. Token stored in httpOnly cookie
   ↓
4. Client sends cookie with each request
   ↓
5. Middleware verifies token (auth.js)
   ↓
6. If valid → proceed | If invalid → 401 Unauthorized
```

### Middleware (`auth.js`)

```javascript
isAuthenticated - Verify JWT token
authorizeRoles('admin') - Check user role
```

**Usage in Routes:**
```javascript
router.post('/create', isAuthenticated, authorizeRoles('admin'), createProduct);
```

---

## 📡 API Request/Response Pattern

### Standard Response Format

**Success (200):**
```javascript
{
  success: true,
  data: { ... },
  message: "Operation successful"
}
```

**Error (4xx/5xx):**
```javascript
{
  success: false,
  error: "Error message",
  statusCode: 400
}
```

### Error Handling

```
Controller
  ↓ (catches error)
catchAsyncError (wraps async functions)
  ↓
error.js (global error handler)
  ↓
Custom Errorhandler class
  ↓
Response to client
```

---

## 🚀 Key Request Flows

### **1. User Registration Flow**

```
POST /api/v1/user/registerUser
  ↓
userController.CreateUser()
  ↓
Validate email not exists
  ↓
Hash password with bcrypt
  ↓
Create user in MongoDB
  ↓
Generate JWT token
  ↓
Send in httpOnly cookie
  ↓
Return user data (200)
```

### **2. Bid Placement Flow**

```
POST /api/bidding/manual-bid
  ↓
manualBiddingController.createManualBid()
  ↓
Check user registered for auction
  ↓
Check auction is active
  ↓
Check bid > currentBid
  ↓
Create ManualBid in database
  ↓
Update Product.currentBid
  ↓
Socket broadcast bid-update
  ↓
BidsManager.processAutoBids()
  ↓
Return success (201)
```

### **3. Auction Registration Flow**

```
POST /api/auction-registration
  ↓
auctionRegistrationController.submitAuctionRegistration()
  ↓
Check user exists
  ↓
Check auction exists
  ↓
Check not already registered
  ↓
Create AuctionRegistration (status: pending)
  ↓
Send confirmation email
  ↓
Return registration (201)

[Admin reviews and approves]

PUT /api/v1/admin/auction-registration/:id
  ↓
Update status to 'approved'
  ↓
Send approval email to user
  ↓
Return updated registration (200)
```

---

## 🔧 Services & External APIs

### **ATTOM Service** (`attomService.js`)

**What it provides:**
- Property valuation (Automated Valuation Model)
- Rental estimates
- Comparable sales
- Tax/assessment data

**Used by:**
- `investmentCalculatorController.js`

**Endpoints:**
```
GET /property/basicprofile - Find property ID
GET /attomavm/detail - Property valuation
GET /valuation/rentalavm - Rental estimate
GET /property/v2/salescomparables/propid/{propId} - Comparables
GET /assessment/detail - Tax data
```

### **CoreLogic Service** (`coreLogicService.js`)

**What it provides:**
- Alternative property valuation
- Rental market analysis
- Tax assessment data

**OAuth Flow:**
1. Get access token (Basic Auth)
2. Use token for API calls
3. Token cached and reused

---

## 📊 Rate Limiting & Performance

### Socket Rate Limiting (`socketRateLimitMiddleware.js`)

```javascript
// Prevent spam/DOS attacks
- join-auction: 1 per second
- place-bid: 2 per second
- auction-timer: 2 per second
- leave-auction: 1 per second

// Max connections per user: 5
```

### Database Optimization

```javascript
// Connection pooling
maxPoolSize: 50
minPoolSize: 10

// Indexes
userModel.email (unique)
manualBiddingModel.auctionId + createdAt
autoBiddingModel.userId + auctionId (unique)
```

### Memory Cleanup (Socket.IO)

```javascript
// Every hour
- Remove ended auctions (no participants)
- Clean old broadcast timestamps

// Every 2 minutes
- Sync active auction data to database
```

---

## 🎯 Important Controllers

### **userController.js**
- `CreateUser` - Register new user
- `Login` - Authenticate user
- `LogOut` - Logout and clear token
- `updateUserDetails` - Update profile
- `updatePassword` - Change password
- `saveProperty` - Save favorite property
- `removeProperty` - Unsave property
- `exportUserData` - GDPR data export
- `deleteAccount` - Soft delete account

### **manualBiddingController.js**
- `checkAuctionAccess` - Verify user access
- `createManualBid` - Place manual bid
- `getBidHistory` - Get auction bid history
- `getUserBidHistory` - Get user's all bids
- `getAuctionBiddingStatus` - Current auction state

### **autoBiddingController.js**
- `getAutoBiddingSettings` - Get auto-bid config
- `saveAutoBiddingSettings` - Save auto-bid
- `disableAutoBidding` - Disable auto-bid
- `getAutoBiddingInfo` - Min bid amounts

### **auctionRegistrationController.js**
- `submitAuctionRegistration` - Submit registration
- `getRegistrationStatus` - Check approval status
- `updateRegistrationStatus` - Admin approve/reject
- `getUserRegistrations` - User's registrations

---

## ✅ Setup & Running

### Environment Variables
```
PORT=5000
DB_URI=mongodb://...
SECRET_KEY=jwt_secret
ATTOM_API_KEY=...
CORELOGIC_CONSUMER_KEY=...
CORELOGIC_CONSUMER_SECRET=...
GEMINI_API_KEY=...
```

### Start Server
```bash
npm install
npm start
```

### Testing Key Endpoints
```bash
# User registration
POST http://localhost:5000/api/v1/user/registerUser

# Login
POST http://localhost:5000/api/v1/user/login

# Get properties
GET http://localhost:5000/api/v1/product/get

# Place bid
POST http://localhost:5000/api/bidding/manual-bid
```

---

## 🔗 Frontend-Backend Connection

**Frontend calls → Backend API:**
```
LiveAuctionRoom.jsx
  ├─ useAuctionRoom.js (Socket.IO)
  │   └─ socketServer.js
  └─ auction_api.js
      └─ manualBiddingController.js

PropertyDetail.jsx
  └─ property_api.js
      └─ investmentCalculatorController.js
          └─ attomService.js

UserPortal.jsx
  └─ user_api.js
      └─ userController.js
```

---

## 📋 Database Queries (Common)

### Get user by ID
```javascript
userModel.findById(userId)
```

### Get property with investment data
```javascript
productModel.findById(productId).select('+investmentData')
```

### Get all bids for auction (sorted by amount)
```javascript
manualBiddingModel.find({ auctionId }).sort({ amount: -1 })
```

### Get highest bidder
```javascript
manualBiddingModel.findOne({ auctionId }).sort({ amount: -1 })
```

### Get user's active auto-bids
```javascript
autoBiddingModel.find({ userId, enabled: true })
```

---

## 🚦 Ready to Extend

New developers should:
1. Read this README
2. Study `userController.js` for pattern
3. Understand `manualBiddingController.js` for complexity
4. Review `socketHandlers.js` for real-time logic
5. Check `productModel.js` for data structure

Core backend logic covered! 🎯
