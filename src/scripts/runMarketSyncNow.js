// scripts/runMarketSyncNow.js
//
// Run the weekly market data sync by hand (same code as jobs/marketSyncJob.js).
//
//   node src/scripts/runMarketSyncNow.js          -> only on-auction properties
//                                                    without a successful sync today (UTC)
//   node src/scripts/runMarketSyncNow.js --all    -> every on-auction property
//
// Before syncing it also cleans up any property that has BOTH the legacy sync
// field and marketSync (written by old code after the one-time rename): the
// newer legacy values are copied into marketSync and the legacy field removed.

require("dotenv").config();
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");
const { syncAllProducts } = require("../services/property/marketSyncService");

const LEGACY_SYNC = "zillowSync";
const LEGACY_STATUS = "zillowStatus";

async function mergeStrayLegacySyncFields() {
    const collection = productModel.collection;
    const docs = await collection
        .find({ [LEGACY_SYNC]: { $exists: true }, marketSync: { $exists: true } })
        .project({ productName: 1, [LEGACY_SYNC]: 1, marketSync: 1 })
        .toArray();

    for (const doc of docs) {
        const legacy = doc[LEGACY_SYNC] || {};
        const current = doc.marketSync || {};
        const legacyIsNewer = legacy.lastSyncedAt && (!current.lastSyncedAt || legacy.lastSyncedAt > current.lastSyncedAt);
        const set = {};
        if (legacyIsNewer) {
            Object.entries(legacy).forEach(([key, value]) => {
                if (key === "url" || key === "enabled") return; // the link + pause switch stay as they are
                set[`marketSync.${key === LEGACY_STATUS ? "marketStatus" : key}`] = value;
            });
            if (set["marketSync.lastStatus"] === undefined) set["marketSync.lastStatus"] = "success";
        }
        await collection.updateOne(
            { _id: doc._id },
            { ...(Object.keys(set).length ? { $set: set } : {}), $unset: { [LEGACY_SYNC]: "" } }
        );
        console.log(`Cleaned legacy sync field on ${doc.productName}${legacyIsNewer ? " (newer values kept)" : ""}`);
    }
}

async function main() {
    await mongoose.connect(process.env.DB_URI);
    await mergeStrayLegacySyncFields();

    const all = process.argv.includes("--all");
    const startOfTodayUtc = new Date(new Date().toISOString().slice(0, 10));
    console.log(all ? "Syncing every on-auction property…" : `Syncing on-auction properties not synced since ${startOfTodayUtc.toISOString()}…`);

    const startedAt = Date.now();
    const summary = await syncAllProducts(all ? {} : { notSyncedSince: startOfTodayUtc });
    console.log(`Done in ${((Date.now() - startedAt) / 60000).toFixed(1)} min:`, summary);

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
