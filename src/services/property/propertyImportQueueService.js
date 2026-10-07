// services/property/propertyImportQueueService.js
//
// Queue for the Property Importer: an admin pastes many market data links at once,
// each becomes a PropertyImportJob, and this worker builds the drafts ONE AT A
// TIME, oldest first, with a randomized pause between scrapes — a steady,
// human-paced trickle instead of a burst the source's bot detection could flag.
//
// The queue lives in MongoDB (not memory), so queued links survive a restart.
// The server runs as one instance (see jobs/marketSyncJob.js), so a simple
// in-process "draining" flag is enough to keep a single worker loop.
//
// Pause between scrapes: random between MARKET_DATA_IMPORT_MIN_DELAY_MS and
// MARKET_DATA_IMPORT_MAX_DELAY_MS (defaults 30s – 75s), measured from the end of one
// scrape to the start of the next.

const PropertyImportJob = require("../../model/property/propertyImportJobModel");
const productModel = require("../../model/property/productModel");
const firecrawlService = require("../integrations/firecrawlService");
const { buildPropertyDraftFromMarketData } = require("./propertyImportService");
const { normalizeMarketDataUrl } = require("../../utils/marketDataUrl");

const MIN_DELAY_MS = Number(process.env.MARKET_DATA_IMPORT_MIN_DELAY_MS) || 30000;
const MAX_DELAY_MS = Math.max(MIN_DELAY_MS, Number(process.env.MARKET_DATA_IMPORT_MAX_DELAY_MS) || 75000);
const MAX_URLS_PER_BATCH = 50;
// A job left "processing" by a crash/restart is re-queued up to this many tries.
const MAX_ATTEMPTS = 3;
const SAFETY_TICK_MS = 60000;
const MAX_ERROR_LENGTH = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));

let draining = false;
let lastFinishedAt = 0;
let nextGapMs = 0;
let started = false;

/** Milliseconds until the next scrape may start (0 when it may start right away). */
function nextScrapeInMs() {
    return Math.max(0, lastFinishedAt + nextGapMs - Date.now());
}

function claimNextJob() {
    return PropertyImportJob.findOneAndUpdate(
        { status: "queued" },
        { $set: { status: "processing", startedAt: new Date(), error: "" }, $inc: { attempts: 1 } },
        { sort: { queuedAt: 1 }, new: true }
    );
}

async function runJob(job) {
    try {
        if (!firecrawlService.isConfigured()) {
            throw new Error("Firecrawl is not configured on the server");
        }
        const { draft, warnings, imageResults } = await buildPropertyDraftFromMarketData({
            marketDataUrl: job.url,
            ...(job.folderRoot ? { folderRoot: job.folderRoot } : {}),
        });
        await PropertyImportJob.updateOne(
            { _id: job._id },
            { $set: { status: "done", draft, warnings, imageResults, finishedAt: new Date() } }
        );
        console.log(`[propertyImport] Draft ready for ${job.url}`);
    } catch (error) {
        const message = String(error?.message || "Import failed").slice(0, MAX_ERROR_LENGTH);
        await PropertyImportJob.updateOne(
            { _id: job._id },
            { $set: { status: "failed", error: message, finishedAt: new Date() } }
        );
        console.error(`[propertyImport] Failed ${job.url}:`, message);
    }
}

/** Work through the queue until it's empty, pausing between scrapes. */
async function drain() {
    if (draining) return;
    draining = true;
    try {
        for (;;) {
            if (!(await PropertyImportJob.exists({ status: "queued" }))) break;

            const wait = lastFinishedAt + nextGapMs - Date.now();
            if (wait > 0) await sleep(wait);

            const job = await claimNextJob();
            if (!job) break; // removed by the admin while we waited

            await runJob(job);
            lastFinishedAt = Date.now();
            nextGapMs = randomDelay();
        }
    } catch (error) {
        console.error("[propertyImport] Worker loop error:", error.message);
    } finally {
        draining = false;
    }
}

/** Start the worker if it's idle. Safe to call any time. */
function kick() {
    drain();
}

/**
 * Queue market data links. Invalid links, repeats within the batch, links already
 * waiting in the importer and links already imported as a property are
 * reported back instead of queued.
 *
 * @returns {Promise<{ queued:object[], invalid:string[], skipped:{url:string, reason:string}[] }>}
 */
async function enqueueImports({ urls, folderRoot = null, userId = null }) {
    const invalid = [];
    const skipped = [];
    const unique = [];
    const seen = new Set();

    urls.forEach((raw) => {
        const url = normalizeMarketDataUrl(raw);
        if (!url) {
            if (String(raw || "").trim()) invalid.push(String(raw).trim());
            return;
        }
        if (seen.has(url)) return;
        seen.add(url);
        unique.push(url);
    });

    const [openJobs, existingProducts] = await Promise.all([
        PropertyImportJob.find({ url: { $in: unique } }).select("url status").lean(),
        productModel.find({ "marketSync.url": { $in: unique } }).select("marketSync.url productName").lean(),
    ]);
    const jobByUrl = new Map(openJobs.map((j) => [j.url, j]));
    const productByUrl = new Map(existingProducts.map((p) => [p.marketSync.url, p]));

    const toQueue = [];
    unique.forEach((url) => {
        const job = jobByUrl.get(url);
        const product = productByUrl.get(url);
        if (job) {
            skipped.push({ url, reason: `Already in the importer (${job.status})` });
        } else if (product) {
            skipped.push({ url, reason: `Already imported as "${product.productName || "a property"}"` });
        } else {
            toQueue.push({ url, folderRoot, createdBy: userId });
        }
    });

    const queued = toQueue.length ? await PropertyImportJob.insertMany(toQueue) : [];
    if (queued.length) kick();

    return { queued, invalid, skipped };
}

/** Re-queue a failed job (goes to the back of the queue). */
async function retryJob(id) {
    const job = await PropertyImportJob.findOneAndUpdate(
        { _id: id, status: "failed" },
        { $set: { status: "queued", error: "", attempts: 0, startedAt: null, finishedAt: null, queuedAt: new Date() } },
        { new: true }
    );
    if (job) kick();
    return job;
}

/**
 * Boot the worker: re-queue jobs a restart cut off mid-scrape, start draining,
 * and re-check every minute in case a kick was missed (e.g. DB not ready yet).
 */
async function startPropertyImportWorker() {
    if (started) return;
    started = true;
    try {
        await PropertyImportJob.updateMany(
            { status: "processing", attempts: { $lt: MAX_ATTEMPTS } },
            { $set: { status: "queued", startedAt: null } }
        );
        await PropertyImportJob.updateMany(
            { status: "processing" },
            { $set: { status: "failed", error: "Stopped by a server restart too many times", finishedAt: new Date() } }
        );
    } catch (error) {
        console.error("[propertyImport] Could not recover interrupted jobs:", error.message);
    }
    kick();
    setInterval(kick, SAFETY_TICK_MS);
    console.log(`[propertyImport] Import queue worker started (${MIN_DELAY_MS / 1000}s–${MAX_DELAY_MS / 1000}s between scrapes).`);
}

module.exports = {
    enqueueImports,
    retryJob,
    startPropertyImportWorker,
    nextScrapeInMs,
    isBusy: () => draining,
    MAX_URLS_PER_BATCH,
};
