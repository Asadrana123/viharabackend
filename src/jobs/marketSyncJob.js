// jobs/marketSyncJob.js
//
// Market data background jobs (Pacific time; the properties are US listings):
//   Sunday 3:00 AM      full refresh of every market data-linked property that
//                       isn't paused (it also checks the listing status)
//   Mon–Sat 5:00 AM     status check only: a live property that sold / went off
//                       market is posted to Slack with Hide / Keep live buttons
// The server runs as one instance, so a simple in-process guard is enough to
// stop a slow run from overlapping the next one (or the other job).

const cron = require("node-cron");
const { syncAllProducts } = require("../services/property/marketSyncService");
const { checkAllStatuses } = require("../services/property/marketStatusWatchService");
const { migrateLegacySyncFields } = require("../services/property/legacySyncFieldMigration");

const SCHEDULE = "0 3 * * 0";
const STATUS_SCHEDULE = "0 5 * * 1-6";
const TIMEZONE = "America/Los_Angeles";

let isRunning = false;

async function runExclusive(name, run) {
    if (isRunning) {
        console.warn(`[marketSync] Another run still in progress — skipping the ${name}.`);
        return;
    }
    isRunning = true;
    const startedAt = Date.now();
    try {
        const summary = await run();
        const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
        console.log(`[marketSync] ${name} done in ${minutes} min:`, summary);
    } catch (error) {
        console.error(`[marketSync] ${name} failed:`, error.message);
    } finally {
        isRunning = false;
    }
}

const runMarketSync = () => runExclusive("weekly sync", syncAllProducts);
const runStatusCheck = () => runExclusive("status check", checkAllStatuses);

function startMarketSyncJob() {
    // One-time rename of the stored sync fields (no-op once done).
    migrateLegacySyncFields();
    cron.schedule(SCHEDULE, runMarketSync, { timezone: TIMEZONE });
    cron.schedule(STATUS_SCHEDULE, runStatusCheck, { timezone: TIMEZONE });
    console.log("[marketSync] Weekly market data sync (Sundays 3:00 AM Pacific) and daily status check (Mon–Sat 5:00 AM Pacific) scheduled.");
}

module.exports = { startMarketSyncJob };
