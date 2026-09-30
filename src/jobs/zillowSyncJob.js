// jobs/zillowSyncJob.js
//
// Weekly background refresh of every Zillow-linked property that isn't paused.
// Schedule: every Sunday at 3:00 AM Pacific (the properties are US listings;
// a quiet hour for both the site and Firecrawl).
// The server runs as one instance, so a simple in-process guard is enough to
// stop a slow run from overlapping the next one.

const cron = require("node-cron");
const { syncAllProducts } = require("../services/property/zillowSyncService");

const SCHEDULE = "0 3 * * 0";
const TIMEZONE = "America/Los_Angeles";

let isRunning = false;

async function runZillowSync() {
    if (isRunning) {
        console.warn("[zillowSync] Previous run still in progress — skipping this one.");
        return;
    }
    isRunning = true;
    const startedAt = Date.now();
    try {
        const summary = await syncAllProducts();
        const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
        console.log(`[zillowSync] Done in ${minutes} min:`, summary);
    } catch (error) {
        console.error("[zillowSync] Run failed:", error.message);
    } finally {
        isRunning = false;
    }
}

function startZillowSyncJob() {
    cron.schedule(SCHEDULE, runZillowSync, { timezone: TIMEZONE });
    console.log("[zillowSync] Weekly Zillow sync scheduled (Sundays 3:00 AM Pacific).");
}

module.exports = { startZillowSyncJob };
