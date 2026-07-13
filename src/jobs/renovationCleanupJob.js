const cron = require("node-cron");
const RenovationRequest = require("../model/renovationRequestModel");

/**
 * renovationCleanupJob
 *
 * Auto-removes transient renovation records the user never saved. Every
 * generation is persisted (needed to poll status and render the before/after),
 * but only ones the user explicitly saves get a `savedAt` timestamp. Anything
 * still unsaved after the grace window is junk — most often a result the user
 * closed the tab on without choosing Save or Discard — and is deleted here.
 *
 * This is the safety net for the one exit we cannot intercept in the browser
 * (hard tab close / navigation), where the in-app "Save or Discard?" prompt
 * never gets a chance to run.
 */

const GRACE_HOURS = 24;

async function runCleanup() {
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);

  try {
    const { deletedCount } = await RenovationRequest.deleteMany({
      savedAt: null,
      createdAt: { $lt: cutoff }
    });

    if (deletedCount > 0) {
      console.log(`[renovationCleanup] Removed ${deletedCount} unsaved renovation(s) older than ${GRACE_HOURS}h`);
    }
  } catch (error) {
    console.error("[renovationCleanup] Cleanup run failed:", error.message);
  }
}

/**
 * Schedule the job. Called once from app.js after the DB connects.
 * Runs hourly; the query is cheap thanks to the { savedAt, createdAt } index.
 */
function startRenovationCleanupJob() {
  // Every hour, on the hour.
  cron.schedule("0 * * * *", runCleanup);
  console.log("[renovationCleanup] Scheduled — hourly, removes unsaved renovations older than 24h");
}

module.exports = { startRenovationCleanupJob, runCleanup };
