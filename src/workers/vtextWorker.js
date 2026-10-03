// workers/vtextWorker.js
//
// Standalone entrypoint for Vtext's background workers (D5 in
// sendify-infra.md: a separate process, deployed as a Render Background
// Worker in production; `VTEXT_RUN_WORKERS_IN_PROCESS=true` boots these
// same functions inside the web process instead, for local dev/a tiny pilot —
// see startVtextWorkersInProcess() below, called from src/index.js).
//
// Phase 2 adds routeWorker and one lineSendWorker-backed Worker per line
// (managed by lineWorkerManager's reconcile loop). Phase 3 adds inboundWorker.
require("dotenv").config();
const mongoose = require("mongoose");
const {
  ensureMaintenanceSchedulers,
  startMaintenanceWorker,
  stopMaintenanceWorker,
} = require("../services/vtext/workers/maintenanceWorker");
const { startRouteWorker, stopRouteWorker } = require("../services/vtext/workers/routeWorker");
const { startInboundWorker, stopInboundWorker } = require("../services/vtext/workers/inboundWorker");
const { startDraftReplyWorker, stopDraftReplyWorker } = require("../services/vtext/workers/draftReplyWorker");
const { startLineWorkerManager, stopLineWorkerManager } = require("../services/vtext/queue/lineWorkerManager");
const { closeAllQueues } = require("../services/vtext/queue/queues");

async function startVtextWorkers() {
  // Same boot assertion as app.js (D7) — this process loads the registry
  // independently, so it needs its own check, not a shared one.
  require("../services/vtext/channels/registry").assertRegistryMatchesEnum();
  await startMaintenanceWorker();
  await ensureMaintenanceSchedulers();
  startRouteWorker();
  startInboundWorker();
  startDraftReplyWorker();
  await startLineWorkerManager();
  console.log("🔧 Vtext workers started");
}

async function stopVtextWorkers() {
  await stopMaintenanceWorker();
  await stopRouteWorker();
  await stopInboundWorker();
  await stopDraftReplyWorker();
  await stopLineWorkerManager();
  await closeAllQueues();
}

async function startVtextWorkersInProcess() {
  // Mongo is already connected by app.js in this mode — just start the workers.
  await startVtextWorkers();
}

// Only run the standalone-process bootstrap (Mongo connect + signal handling)
// when this file is executed directly (`node src/workers/vtextWorker.js`),
// not when imported by src/index.js for in-process mode.
if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(process.env.DB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      console.log("[vtext-worker] MongoDB connected");
      await startVtextWorkers();
    } catch (err) {
      console.error("[vtext-worker] failed to start:", err);
      process.exit(1);
    }
  })();

  const shutdown = async (signal) => {
    console.log(`[vtext-worker] received ${signal}, shutting down...`);
    await stopVtextWorkers();
    await mongoose.connection.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = { startVtextWorkers, stopVtextWorkers, startVtextWorkersInProcess };
