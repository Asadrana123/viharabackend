// jobs/brevoBackfillJob.js
//
// Runs the Brevo email-event backfill automatically at 09:00 IST every day.
//
// It reuses the app's live Mongo connection (via runBrevoBackfill) and never
// opens or closes one of its own, so it is safe to run inside the long-lived
// server process. Upserts are idempotent, so a daily run only patches whatever
// gap the live webhook missed — it never duplicates existing rows.

const cron = require("node-cron");
const { runBrevoBackfill } = require("../scripts/backfillBrevoEmails");

// How far back the DAILY run looks. A short window is all a daily gap-filler
// needs; override with BREVO_BACKFILL_JOB_DAYS (e.g. set to 90 for a full sweep).
const JOB_BACKFILL_DAYS = Math.max(1, parseInt(process.env.BREVO_BACKFILL_JOB_DAYS, 10) || 3);

const SCHEDULE = "0 9 * * *";     // 09:00, every day
const TIMEZONE = "Asia/Kolkata";  // IST

let task = null;

function startBrevoBackfillJob() {
  if (task) return task; // guard against accidental double-start

  task = cron.schedule(
    SCHEDULE,
    async () => {
      const startedAt = new Date();
      console.log(`[brevo-backfill] run started at ${startedAt.toISOString()} (09:00 IST)`);
      try {
        const { totalSeen, totalInserted } = await runBrevoBackfill({ days: JOB_BACKFILL_DAYS });
        console.log(`[brevo-backfill] done — seen ${totalSeen}, inserted ${totalInserted}`);
      } catch (err) {
        console.error("[brevo-backfill] failed:", err.response?.data || err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  console.log(`[brevo-backfill] scheduled daily at 09:00 ${TIMEZONE} (lookback ${JOB_BACKFILL_DAYS}d)`);
  return task;
}

module.exports = { startBrevoBackfillJob };
