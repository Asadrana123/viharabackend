// scripts/marketSyncReport.js
//
// Read-only check of the weekly market data sync (jobs/marketSyncJob.js). Lists
// every market data-linked property with when it last synced and whether it worked,
// and flags the ones the weekly job should have reached but didn't.
//
//   node src/scripts/marketSyncReport.js
//
// Changes nothing in the database.

require("dotenv").config();
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");

// A sync runs every Sunday; anything older than this missed at least one run.
const STALE_AFTER_DAYS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const fmt = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never");

async function main() {
    await mongoose.connect(process.env.DB_URI);

    const products = await productModel
        .find({ "marketSync.url": { $nin: [null, ""] } })
        .select("productName showOnAuctions marketSync")
        .sort({ "marketSync.lastSyncedAt": -1 })
        .lean();

    const now = Date.now();
    const rows = products.map((p) => {
        const s = p.marketSync || {};
        const inScope = p.showOnAuctions && s.enabled !== false;
        const ageDays = s.lastSyncedAt ? (now - new Date(s.lastSyncedAt)) / DAY_MS : null;
        let verdict;
        if (!inScope) verdict = p.showOnAuctions ? "skipped (paused)" : "skipped (not on /auctions)";
        else if (!s.lastSyncedAt) verdict = "NEVER SYNCED";
        else if (s.lastStatus === "failed") verdict = "FAILED";
        else if (ageDays > STALE_AFTER_DAYS) verdict = "STALE";
        else verdict = "ok";
        return {
            property: String(p.productName || p._id).slice(0, 45),
            verdict,
            lastSyncedAt: fmt(s.lastSyncedAt),
            daysAgo: ageDays == null ? "-" : ageDays.toFixed(1),
            marketStatus: s.marketStatus || "-",
            error: s.lastError ? String(s.lastError).slice(0, 60) : "",
        };
    });

    console.table(rows);

    const count = (v) => rows.filter((r) => r.verdict === v).length;
    const newest = products.find((p) => p.marketSync?.lastSyncedAt)?.marketSync.lastSyncedAt;
    console.log(`Linked properties: ${rows.length}`);
    console.log(`  ok: ${count("ok")}, failed: ${count("FAILED")}, stale: ${count("STALE")}, never synced: ${count("NEVER SYNCED")}`);
    console.log(`  skipped by design (paused / not on /auctions): ${rows.filter((r) => r.verdict.startsWith("skipped")).length}`);
    console.log(`Most recent sync of any property: ${fmt(newest)}`);

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
