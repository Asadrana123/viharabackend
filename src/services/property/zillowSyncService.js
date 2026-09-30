// services/property/zillowSyncService.js
//
// Weekly refresh of every property linked to a Zillow listing
// (productModel.zillowSync.url). Runs from jobs/zillowSyncJob.js.
//
// What a sync CHANGES (Zillow data only, money shifted by the property's fixed %):
//   propertyDetails, investmentData, marketInsights.daysOnMarket, schools,
//   walkScores, coordinates, listingAgent — and the photos, but only when
//   Zillow's photo list itself changed since the last sync.
// A new value only replaces the old one when Zillow actually has it; empty
// Zillow data never wipes what the property already has.
//
// What a sync NEVER touches: everything the admin edits in Manage Listings
// (title, description, address, beds/baths/sqft/lot/year, types, HOA, APN),
// auction terms (dates, starting bid, reserve, current bid, EMD, ...),
// visibility and status. If Zillow's own status changes (e.g. sold / off
// market), the property is only flagged for the admin — nothing else happens.

const productModel = require("../../model/property/productModel");
const firecrawlService = require("../integrations/firecrawlService");
const {
    fetchZillowListing,
    buildZillowDataFields,
    uploadListingImages,
    folderKeyFor,
} = require("./propertyImportService");
const { createTweakPercent, isValidTweakPercent } = require("./priceTweakService");

// Pause between properties so Zillow/Firecrawl aren't hit in a burst.
const DELAY_BETWEEN_PROPERTIES_MS = 5000;
const PHOTO_FOLDER_ROOT = "vihara/properties";
const MAX_ERROR_LENGTH = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

/**
 * Fresh Zillow values over the existing ones, keeping existing values wherever
 * Zillow has nothing: null/undefined keeps the old value, an empty list keeps
 * the old list, objects merge key by key.
 */
function mergeKeepExisting(existing, incoming) {
    if (Array.isArray(incoming)) {
        return incoming.length ? incoming : existing ?? [];
    }
    if (isPlainObject(incoming)) {
        const base = isPlainObject(existing) ? existing : {};
        const out = { ...base };
        Object.keys(incoming).forEach((key) => {
            out[key] = mergeKeepExisting(base[key], incoming[key]);
        });
        return out;
    }
    return incoming === null || incoming === undefined ? existing : incoming;
}

/**
 * Sync one property. Throws on scrape/parse failure (the caller records it).
 * @param {import("mongoose").Document} product  Full productModel document.
 * @returns {Promise<{ photosUpdated:boolean, statusChanged:boolean }>}
 */
async function syncProduct(product) {
    const sync = product.zillowSync;
    const tweakPercent = isValidTweakPercent(sync.tweakPercent) ? sync.tweakPercent : createTweakPercent();

    const { zillow, photoUrls, photoSignature } = await fetchZillowListing(sync.url);
    const fresh = buildZillowDataFields(zillow, tweakPercent);

    // Zillow data fields — merged so empty Zillow data never wipes existing data.
    const current = product.toObject();
    Object.entries(fresh).forEach(([field, value]) => {
        product.set(field, mergeKeepExisting(current[field], value));
    });

    // Photos — only when Zillow's photo list changed. The first sync of a
    // linked (older) property just records the fingerprint, so photos the
    // admin already chose stay untouched.
    let photosUpdated = false;
    if (photoSignature && sync.photoSignature && photoSignature !== sync.photoSignature) {
        const folder = `${PHOTO_FOLDER_ROOT}/${folderKeyFor(product)}`;
        const { image, otherImages } = await uploadListingImages(photoUrls, folder, []);
        if (image) {
            product.image = image;
            product.otherImages = otherImages;
            photosUpdated = true;
        }
    }
    // Keep the old fingerprint if the upload failed, so the next sync retries.
    if (photoSignature && (photosUpdated || !sync.photoSignature)) {
        sync.photoSignature = photoSignature;
    }

    // Zillow status — flag a change for the admin, change nothing else.
    const newStatus = zillow.homeStatus || null;
    const statusChanged = Boolean(sync.zillowStatus && newStatus && newStatus !== sync.zillowStatus);
    if (statusChanged) {
        sync.statusAlert = { from: sync.zillowStatus, to: newStatus, detectedAt: new Date() };
    }
    if (newStatus) sync.zillowStatus = newStatus;

    sync.tweakPercent = tweakPercent;
    sync.lastSyncedAt = new Date();
    sync.lastStatus = "success";
    sync.lastError = null;

    // validateBeforeSave:false — same as the other admin updates: legacy
    // properties may miss unrelated required fields, which must not block a sync.
    await product.save({ validateBeforeSave: false });

    return { photosUpdated, statusChanged };
}

/** Record a failed sync without touching any other field. */
async function markSyncFailed(productId, error) {
    const message = String(error?.message || error || "Unknown error").slice(0, MAX_ERROR_LENGTH);
    await productModel.updateOne(
        { _id: productId },
        {
            $set: {
                "zillowSync.lastSyncedAt": new Date(),
                "zillowSync.lastStatus": "failed",
                "zillowSync.lastError": message,
            },
        }
    );
}

/**
 * Sync every linked, not-paused property, one at a time.
 * @returns {Promise<{ total:number, succeeded:number, failed:number, statusAlerts:number,
 *                     photosUpdated:number, skipped?:string }>}
 */
async function syncAllProducts() {
    const summary = { total: 0, succeeded: 0, failed: 0, statusAlerts: 0, photosUpdated: 0 };

    if (!firecrawlService.isConfigured()) {
        return { ...summary, skipped: "FIRECRAWL_API_KEY missing" };
    }

    // Ids only — each property is loaded fresh right before its own sync, so
    // an admin edit made during a long run is never overwritten by stale data.
    const ids = await productModel
        .find({ "zillowSync.url": { $nin: [null, ""] }, "zillowSync.enabled": { $ne: false } })
        .select("_id")
        .lean();
    summary.total = ids.length;

    for (let i = 0; i < ids.length; i++) {
        const { _id } = ids[i];
        try {
            const product = await productModel.findById(_id);
            // Re-check: the admin may have paused or unlinked it since the run began.
            if (!product || !product.zillowSync?.url || product.zillowSync.enabled === false) {
                summary.total -= 1;
                continue;
            }
            const result = await syncProduct(product);
            summary.succeeded += 1;
            if (result.statusChanged) summary.statusAlerts += 1;
            if (result.photosUpdated) summary.photosUpdated += 1;
        } catch (error) {
            summary.failed += 1;
            console.error(`[zillowSync] Property ${_id} failed:`, error.message);
            try {
                await markSyncFailed(_id, error);
            } catch (markError) {
                console.error(`[zillowSync] Could not record failure for ${_id}:`, markError.message);
            }
        }
        if (i < ids.length - 1) await sleep(DELAY_BETWEEN_PROPERTIES_MS);
    }

    return summary;
}

module.exports = { syncAllProducts, syncProduct, mergeKeepExisting };
