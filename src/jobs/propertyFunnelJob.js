// jobs/propertyFunnelJob.js
//
// Property Funnel sync schedule (Pacific), only when PROPERTY_FUNNEL_SYNC_ENABLED=true.
// What each job does: services/propertyFunnel/sync/index.js. Run one by hand:
//   node src/scripts/propertyFunnelSync.js <ads|ads-nightly|ga4|ga4-nightly|clarity|sanity|posts|all>
const cron = require("node-cron");
const { runJob } = require("../services/propertyFunnel/sync");

const TIMEZONE = "America/Los_Angeles";
const SCHEDULE = [
  ["0 */3 * * *", "ads"],
  ["0 2 * * *", "ads-nightly"],
  ["15 */3 * * *", "ga4"],
  ["30 2 * * *", "ga4-nightly"],
  ["0 1 * * *", "clarity"],
  ["45 * * * *", "sanity"],
  ["30 */6 * * *", "posts"],
];

let started = false;

function startPropertyFunnelJob() {
  if (started || process.env.PROPERTY_FUNNEL_SYNC_ENABLED !== "true") return;
  started = true;
  for (const [expr, job] of SCHEDULE) cron.schedule(expr, () => runJob(job), { timezone: TIMEZONE });
  console.log("[property-funnel] sync scheduled (Pacific): ads 3h + 02:00, GA4 3h + 02:30, Clarity 01:00, Sanity hourly, posts 6h.");
}

module.exports = { startPropertyFunnelJob, SCHEDULE };
