// services/cloudinaryService.js
//
// Thin, self-contained wrapper around Cloudinary for the property importer.
// Uploads images to Cloudinary and returns their permanent secure_url values.
//
// Why upload-by-URL: the importer receives Zillow CDN photo URLs
// (photos.zillowstatic.com …) collected in the browser. Zillow's *image* CDN
// is public — unlike the listing pages — so Cloudinary can fetch these URLs
// directly. We never persist raw Zillow URLs; only the Cloudinary secure_url
// ends up in the product's image / otherImages fields.
//
// Env vars (already in your .env):
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET

const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * True only when all three Cloudinary env vars are present. Callers use this to
 * fail fast with a clear message instead of a cryptic Cloudinary auth error.
 */
function isConfigured() {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

/**
 * Upload a single remote image URL to Cloudinary.
 * @param {string} url     Publicly fetchable image URL.
 * @param {string} folder  Cloudinary folder to place the asset in.
 * @returns {Promise<string>} the resulting secure_url.
 */
async function uploadImageFromUrl(url, folder) {
    const result = await cloudinary.uploader.upload(url, {
        folder,
        resource_type: "image",
        // Keep an auto format/quality-friendly asset without transforming the
        // original; downstream display components handle sizing.
        overwrite: false,
        unique_filename: true,
    });
    return result.secure_url;
}

/**
 * Upload many image URLs with a small concurrency cap so we never hammer
 * Cloudinary (or trip its rate limits) on a 30–40 photo listing.
 *
 * Order is preserved: `uploaded[i]` corresponds to `urls[i]` when it succeeded.
 * Failures are collected rather than thrown, so one bad URL never sinks the
 * whole batch — the caller decides what to do with partial results.
 *
 * @param {string[]} urls
 * @param {string}   folder
 * @param {object}   [opts]
 * @param {number}   [opts.concurrency=4]
 * @returns {Promise<{ uploaded: string[], failed: Array<{ url:string, error:string }> }>}
 */
async function uploadImagesFromUrls(urls, folder, opts = {}) {
    const list = Array.isArray(urls) ? urls.filter((u) => typeof u === "string" && u.trim()) : [];
    const concurrency = Math.max(1, Number(opts.concurrency) || 4);

    const uploadedSlots = new Array(list.length).fill(null);
    const failed = [];

    let cursor = 0;
    async function worker() {
        while (cursor < list.length) {
            const index = cursor++;
            const url = list[index];
            try {
                uploadedSlots[index] = await uploadImageFromUrl(url, folder);
            } catch (err) {
                failed.push({ url, error: err?.message || "Upload failed" });
            }
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, list.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    // Drop the slots that failed (null) while keeping successful order.
    const uploaded = uploadedSlots.filter((u) => typeof u === "string");

    return { uploaded, failed };
}

module.exports = {
    isConfigured,
    uploadImageFromUrl,
    uploadImagesFromUrls,
};
