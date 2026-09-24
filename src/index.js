require('dotenv').config();
const http = require('http');
const app = require('./app');
const initSocketServer = require('./socket/socketServer');
const { setIoInstance } = require('./socket/getIoInstance');
const { startEarlyAccessCallScheduler } = require('./services/calling/earlyAccessCallScheduler');
const { startGeorgiaStCallScheduler } = require('./services/calling/georgiaStCallScheduler');
const { startRensselaerAveCallScheduler } = require('./services/calling/rensselaerAveCallScheduler');
const { startPartnerCallScheduler } = require('./services/calling/partnerCallScheduler');
const { startNorCalCallScheduler } = require('./services/calling/norCalCallScheduler');
const { startVoiceCallbackScheduler } = require('./services/calling/voiceCallbackScheduler'); // ← ADD
const { startPropertyCallScheduler } = require('./services/calling/propertyCallScheduler'); // unified /auction/:slug scheduler
const { startBrevoBackfillJob } = require('./jobs/brevoBackfillJob'); // ← ADD
const { startAuctionCloseJob } = require('./jobs/auctionCloseJob');
require('./passport');

const PORT = process.env.PORT || 8000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocketServer(server);
setIoInstance(io)

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
 // Daily Brevo email-event backfill at 09:00 IST (patches gaps the webhook missed).
  startBrevoBackfillJob();
  // Close ended auctions + email sellers every minute, even if no one is watching.
  startAuctionCloseJob();
  // Start the early-access daily 1:32 PM callback scheduler (every-minute sweep).
  startEarlyAccessCallScheduler();

  // Property auction daily 1:32 PM local callback schedulers.
  startGeorgiaStCallScheduler();
  startRensselaerAveCallScheduler();

  // Partner Program daily 1:32 PM local callback scheduler.
  startPartnerCallScheduler();

  // Northern California early-access daily local callback scheduler
  // (11:00 AM / 2:30 PM / 6:00 PM in the lead's timezone).
  startNorCalCallScheduler();

  // Human-requested callbacks ("call me back in 10 minutes"). Dials at the exact
  // time asked, then falls into the daily 1:32 PM retry loop on no-answer.
  startVoiceCallbackScheduler();

  // Unified scheduler for every /auction/:slug landing page. New properties need
  // no new scheduler — this one sweeps the shared propertyLeadModel collection.
  startPropertyCallScheduler();
});
