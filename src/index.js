require('dotenv').config();
const http = require('http');
const app = require('./app');
const initSocketServer = require('./socket/socketServer');
const { setIoInstance } = require('./socket/getIoInstance');
const { startEarlyAccessCallScheduler } = require('./services/earlyAccessCallScheduler');
const { startGeorgiaStCallScheduler } = require('./services/georgiaStCallScheduler');
const { startRensselaerAveCallScheduler } = require('./services/rensselaerAveCallScheduler');
const { startPartnerCallScheduler } = require('./services/partnerCallScheduler');
const { startVoiceCallbackScheduler } = require('./services/voiceCallbackScheduler'); // ← ADD
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

  // Start the early-access daily 1:32 PM callback scheduler (every-minute sweep).
  startEarlyAccessCallScheduler();

  // Property auction daily 1:32 PM local callback schedulers.
  startGeorgiaStCallScheduler();
  startRensselaerAveCallScheduler();

  // Partner Program daily 1:32 PM local callback scheduler.
  startPartnerCallScheduler();

  // Human-requested callbacks ("call me back in 10 minutes"). Dials at the exact
  // time asked, then falls into the daily 1:32 PM retry loop on no-answer.
  startVoiceCallbackScheduler();
});
