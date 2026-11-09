// Runs Property Funnel sync jobs once, by hand, against the database in DB_URI.
//   node src/scripts/propertyFunnelSync.js ads ga4 sanity posts clarity
//   node src/scripts/propertyFunnelSync.js all          (every job except the nightly ones)
//   node src/scripts/propertyFunnelSync.js ads ga4 --days=60   (first backfill; Clarity can't go back)
// Each run is recorded in pf_sync_runs, as when the schedule runs it.
require("dotenv").config();
require("../config/outboundSwitch").installOutboundGuards(); // honours OUTBOUND_DISABLED like the server
const mongoose = require("mongoose");
const { runJob, JOBS } = require("../services/propertyFunnel/sync");

(async () => {
  const args = process.argv.slice(2);
  const daysArg = args.find((a) => a.startsWith("--days="));
  const days = daysArg ? Math.min(400, Math.max(1, Number(daysArg.split("=")[1]) || 0)) : undefined;
  let names = args.filter((a) => !a.startsWith("--"));
  if (!names.length) {
    console.log(`Usage: node src/scripts/propertyFunnelSync.js <${Object.keys(JOBS).join("|")}|all> ...`);
    process.exit(1);
  }
  if (names.includes("all")) names = ["ads", "ga4", "clarity", "sanity", "posts"];
  await mongoose.connect(process.env.DB_URI);
  let failed = 0;
  for (const name of names) {
    const t = Date.now();
    const r = await runJob(name, { days });
    if (!r.ok) failed++;
    console.log(`${r.ok ? "OK  " : "FAIL"} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s): ${r.detail}`);
  }
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
