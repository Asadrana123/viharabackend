// workers/sendifyWorker.js
//
// Standalone entrypoint for Sendify's background workers (D5 in
// sendify-infra.md: a separate process, deployed as a Render Background
// Worker in production; `SENDIFY_RUN_WORKERS_IN_PROCESS=true` boots these
// same functions inside the web process instead, for local dev/a tiny pilot —
// see startSendifyWorkersInProcess() below, called from src/index.js).
//
// Phase 0: only the maintenance worker + its noop-heartbeat scheduler exist.
// Later phases add routeWorker, lineSendWorker (one per line), inboundWorker —
// each gets started here too.
require("dotenv").config();
const mongoose = require("mongoose");
const {
  ensureMaintenanceSchedulers,
  startMaintenanceWorker,
  stopMaintenanceWorker,
} = require("../services/sendify/workers/maintenanceWorker");
const { closeAllQueues } = require("../services/sendify/queue/queues");

async function startSendifyWorkers() {
  // Same boot assertion as app.js (D7) — this process loads the registry
  // independently, so it needs its own check, not a shared one.
  require("../services/sendify/channels/registry").assertRegistryMatchesEnum();
  await startMaintenanceWorker();
  await ensureMaintenanceSchedulers();
  console.log("🔧 Sendify workers started");
}

async function stopSendifyWorkers() {
  await stopMaintenanceWorker();
  await closeAllQueues();
}

async function startSendifyWorkersInProcess() {
  // Mongo is already connected by app.js in this mode — just start the workers.
  await startSendifyWorkers();
}

// Only run the standalone-process bootstrap (Mongo connect + signal handling)
// when this file is executed directly (`node src/workers/sendifyWorker.js`),
// not when imported by src/index.js for in-process mode.
if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(process.env.DB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      console.log("[sendify-worker] MongoDB connected");
      await startSendifyWorkers();
    } catch (err) {
      console.error("[sendify-worker] failed to start:", err);
      process.exit(1);
    }
  })();

  const shutdown = async (signal) => {
    console.log(`[sendify-worker] received ${signal}, shutting down...`);
    await stopSendifyWorkers();
    await mongoose.connection.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = { startSendifyWorkers, stopSendifyWorkers, startSendifyWorkersInProcess };
