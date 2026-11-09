// services/propertyFunnel/sync/index.js
//
// Property Funnel sync jobs: one entry point. Each run is recorded in pf_sync_runs (the Data health tab).
//   ads          every 3 h, last 2 days         ads-nightly   02:00 Pacific, last 7 days (Meta revises)
//   ga4          every 3 h, last 2 days         ga4-nightly   02:30 Pacific, last 3 days (GA4 fills in late)
//   clarity      01:00 Pacific (never miss a day: Clarity keeps 3 days only)
//   sanity       hourly
//   posts        every 6 h
// Texts, calls and emails need no job: the tab reads our own Vtext, call log and Brevo events live.

const PfSyncRun = require("../../../model/propertyFunnel/pfSyncRunModel");
const { syncZernioAds } = require("./zernioAdsSync");
const { syncGa4 } = require("./ga4Sync");
const { syncClarity } = require("./claritySync");
const { syncSanity } = require("./sanitySync");
const { syncZernioPosts } = require("./zernioPostsSync");

// `days` (manual runs only, for a first backfill): how many days back ads and GA4 pull. Clarity can't backfill.
const JOBS = {
  ads: { source: "Zernio ads", run: (o) => syncZernioAds({ days: o.days || 2 }) },
  "ads-nightly": { source: "Zernio ads", run: (o) => syncZernioAds({ days: o.days || 7 }) },
  ga4: { source: "GA4", run: (o) => syncGa4({ days: o.days || 2 }) },
  "ga4-nightly": { source: "GA4", run: (o) => syncGa4({ days: o.days || 3 }) },
  clarity: { source: "Clarity", run: () => syncClarity() },
  sanity: { source: "Sanity", run: () => syncSanity() },
  posts: { source: "Zernio posts", run: () => syncZernioPosts() },
};

const running = new Set();

/** Runs one job and records how it went. Never throws: returns { ok, detail }. A job already running is skipped. */
async function runJob(name, opts = {}) {
  const job = JOBS[name];
  if (!job) return { ok: false, detail: `Unknown job "${name}". Jobs: ${Object.keys(JOBS).join(", ")}` };
  if (running.has(job.source)) return { ok: false, detail: `${job.source} is already running` };
  running.add(job.source);
  try {
    const detail = await job.run(opts);
    await PfSyncRun.record(job.source, true, detail);
    return { ok: true, detail };
  } catch (error) {
    const detail = String((error && error.message) || error).slice(0, 500);
    await PfSyncRun.record(job.source, false, detail).catch(() => {});
    console.error(`[property-funnel] ${name} failed:`, detail);
    return { ok: false, detail };
  } finally {
    running.delete(job.source);
  }
}

module.exports = { runJob, JOBS };
