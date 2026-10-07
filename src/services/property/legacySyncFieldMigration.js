// services/property/legacySyncFieldMigration.js
//
// ONE-TIME rename of the stored sync fields to their market data names:
//   products              : OLD_SYNC              -> marketSync
//                           marketSync.OLD_STATUS -> marketSync.marketStatus
//   property import jobs  : draft.OLD_SYNC        -> draft.marketSync (+ status inside)
// Runs on server start (jobs/marketSyncJob.js) and is idempotent: once nothing
// carries the old names, every update matches zero documents.
// The old names only exist below so this can find them. Delete this file (and
// its call in marketSyncJob.js) once production has started with it once.

const productModel = require("../../model/property/productModel");
const PropertyImportJob = require("../../model/property/propertyImportJobModel");

const OLD_SYNC = "zillowSync";
const OLD_STATUS = "zillowStatus";

/** Rename `from` -> `to` on every document that has `from` and not yet `to`. */
async function renameField(collection, from, to) {
    const { modifiedCount } = await collection.updateMany(
        { [from]: { $exists: true }, [to]: { $exists: false } },
        { $rename: { [from]: to } }
    );
    return modifiedCount;
}

async function migrateLegacySyncFields() {
    try {
        // Raw collections: the schemas no longer know the old paths, so
        // Mongoose would strip them from the update.
        const products = productModel.collection;
        const jobs = PropertyImportJob.collection;
        const counts = {
            products: await renameField(products, OLD_SYNC, "marketSync"),
            productStatus: await renameField(products, `marketSync.${OLD_STATUS}`, "marketSync.marketStatus"),
            importDrafts: await renameField(jobs, `draft.${OLD_SYNC}`, "draft.marketSync"),
            importDraftStatus: await renameField(jobs, `draft.marketSync.${OLD_STATUS}`, "draft.marketSync.marketStatus"),
        };
        if (Object.values(counts).some(Boolean)) {
            console.log("[marketSync] Renamed legacy sync fields:", counts);
        }
    } catch (error) {
        console.error("[marketSync] Legacy sync field rename failed:", error.message);
    }
}

module.exports = { migrateLegacySyncFields };
