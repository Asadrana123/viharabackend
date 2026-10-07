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
const { startNewDealsCallScheduler } = require('./services/calling/newDealsCallScheduler');
const { startVoiceCallbackScheduler } = require('./services/calling/voiceCallbackScheduler'); // ← ADD
const { startPropertyCallScheduler } = require('./services/calling/propertyCallScheduler'); // unified /auction/:slug scheduler
const { startMatchCallScheduler } = require('./services/buyerMatch/matchCallService'); // admin-started Buyer Match calls
const { startBrevoBackfillJob } = require('./jobs/brevoBackfillJob'); // ← ADD
const { startAuctionCloseJob } = require('./jobs/auctionCloseJob');
const { startMarketSyncJob } = require('./jobs/marketSyncJob');
const { startPropertyImportWorker } = require('./services/property/propertyImportQueueService');
const { startVtextWorkersInProcess } = require('./workers/vtextWorker');
const { startVtextSocketBridge } = require('./socket/vtextSocketBridge');
const { startVtextWatchdog } = require('./services/vtext/vtextWatchdogService');
const { startMetaAdsReportJob } = require('./jobs/metaAdsReportJob');
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
  startNewDealsCallScheduler();

  // Human-requested callbacks ("call me back in 10 minutes"). Dials at the exact
  // time asked, then falls into the daily 1:32 PM retry loop on no-answer.
  startVoiceCallbackScheduler();

  // Unified scheduler for every /auction/:slug landing page. New properties need
  // no new scheduler — this one sweeps the shared propertyLeadModel collection.
  startPropertyCallScheduler();

  // Buyer Match calls an admin started: 12:30 PM + 6:00 PM buyer-local, up to 7 days.
  startMatchCallScheduler();

  // Weekly market data refresh of every linked property the admin hasn't paused.
  startMarketSyncJob();

  // Property Importer queue: market data links an admin queued, scraped one at a time.
  startPropertyImportWorker();

  // Vtext (in-house iMessage/SMS infra): fully inert unless VTEXT_ENABLED=true.
  // In production the worker runs as a separate Render process
  // (src/workers/vtextWorker.js); set VTEXT_RUN_WORKERS_IN_PROCESS=true
  // for local dev / a tiny pilot to boot it inside this same process instead.
  if (process.env.VTEXT_ENABLED === 'true' && process.env.VTEXT_RUN_WORKERS_IN_PROCESS === 'true') {
    startVtextWorkersInProcess().catch((err) => {
      console.error('[vtext] failed to start in-process workers:', err);
    });
  }
  // The socket bridge always belongs to the WEB process (it owns the live
  // socket.io connections) regardless of where the workers themselves run —
  // unlike the workers-in-process flag above, this doesn't depend on it.
  if (process.env.VTEXT_ENABLED === 'true') {
    startVtextSocketBridge(io);
    // Slack alert when Redis or the workers stop. Lives here, not in the workers, so it can
    // still speak when they are the thing that died.
    startVtextWatchdog();
  }

  // Daily 9:00 AM IST Meta Ads performance report + AI suggestions to Slack.
  startMetaAdsReportJob();
});
