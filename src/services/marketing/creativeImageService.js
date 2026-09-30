// services/marketing/creativeImageService.js
//
// PRD Step 6 - ad image jobs. The admin starts image generation for one ad
// set (cell), or regenerates one image; the work runs in the background and
// the review screen polls GET /runs/:runId for progress.
//
// Per image: creativePlanner decides the exact text -> the active provider
// draws it -> Cloudinary stores it (resized to the final Meta size, with the
// real Vihara logo placed on top) -> the run is updated. One job per cell at a time. Images can only be made while the
// run is "ready" (before approval).
//
// Run updates here use atomic update pipelines, never run.save(), so they
// can't overwrite line edits the admin makes at the same time.

const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Errorhandler = require("../../utils/errorhandler");
const MarketingRun = require("../../model/marketing/marketingRunModel");
const { planCellImages, isImageOutdated, findCell, allSlotIds, propertyPhotos } = require("./creativePlanner");
const { getCreativeProvider } = require("./creativeProviders");
const templateService = require("./templateService");
const { CREATIVE_CONFIG, LOGO_PLACEMENT, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");
const { TEMPLATE_STATUS, MAX_TEMPLATE_PHOTOS } = require("../../config/marketing/templateConfig");
const {
    RUN_STATUS,
    IMAGE_JOB_STATUS,
    IMAGE_JOB_STALE_AFTER_MS,
} = require("../../config/marketing/marketingConstants");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_PROBLEM_CHARS = 300;
const STALE_MESSAGE = "Image generation was interrupted. Generate again.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const staleCutoff = () => new Date(Date.now() - IMAGE_JOB_STALE_AFTER_MS);

const isJobActive = (job) =>
    job.status === IMAGE_JOB_STATUS.RUNNING && new Date(job.startedAt) > staleCutoff();

function readableError(error) {
    const detail = error?.response?.data?.detail || error?.response?.data?.message || error?.message;
    const text = typeof detail === "string" ? detail : JSON.stringify(detail || "Image generation failed");
    return text.slice(0, MAX_PROBLEM_CHARS);
}

// Cloudinary public ids allow letters, digits, "_", "-" and "/".
function publicIdFor(runId, spec) {
    const name = `${spec.cellKey}__${spec.kind}__${spec.format}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `${CREATIVE_CONFIG.cloudinaryFolder}/${runId}/${name}`;
}

/**
 * The logo layer: a public id in this Cloudinary account when set (layer ids
 * use ":" instead of "/" for folders), otherwise a remote URL that Cloudinary
 * fetches. null = no logo configured.
 */
function logoOverlay() {
    if (CREATIVE_CONFIG.logoPublicId) return CREATIVE_CONFIG.logoPublicId.replace(/\//g, ":");
    if (CREATIVE_CONFIG.logoUrl) return { url: CREATIVE_CONFIG.logoUrl };
    return null;
}

/**
 * Cloudinary upload transformation: resize to the final Meta size, then place
 * the real logo file in the top-left corner (the prompt keeps it empty).
 */
function uploadTransformation(spec) {
    const steps = [{ ...spec.size.final, crop: "fill", gravity: "center" }];

    const overlay = logoOverlay();
    const placement = LOGO_PLACEMENT[spec.format];
    if (overlay && placement) {
        steps.push(
            { overlay, width: placement.width, crop: "scale" },
            { flags: "layer_apply", gravity: "north_west", x: placement.x, y: placement.y }
        );
    }
    return steps;
}

/** Run async tasks with a concurrency cap. */
async function runPool(items, concurrency, worker) {
    let cursor = 0;
    const next = async () => {
        while (cursor < items.length) {
            const item = items[cursor++];
            await worker(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

// Update the job started at `startedAt` for this cell (never a newer one).
function updateJob(runId, cellKey, startedAt, update) {
    return MarketingRun.updateOne({ _id: runId }, update, {
        arrayFilters: [{ "job.cellKey": cellKey, "job.startedAt": startedAt }],
    });
}

// ---------------------------------------------------------------------------
// Background processing (never throws)
// ---------------------------------------------------------------------------
async function makeOneImage({ runId, spec, provider, userId, job }) {
    try {
        const { source, template } = await provider.generate(spec);

        const upload = await cloudinary.uploader.upload(source, {
            public_id: publicIdFor(runId, spec),
            overwrite: true,
            invalidate: true,
            resource_type: "image",
            transformation: uploadTransformation(spec),
        });

        const image = {
            cellKey: spec.cellKey,
            kind: spec.kind,
            format: spec.format,
            url: upload.secure_url,
            publicId: upload.public_id,
            provider: provider.name,
            providerModel: provider.model(),
            textSnapshot: spec.textSnapshot,
            template: template || null,
            createdBy: userId,
            createdAt: new Date(),
        };

        // Replace the image for this slot (only while the run is still editable).
        await MarketingRun.updateOne({ _id: runId, status: RUN_STATUS.READY }, [
            {
                $set: {
                    images: {
                        $concatArrays: [
                            {
                                $filter: {
                                    input: { $ifNull: ["$images", []] },
                                    cond: {
                                        $not: {
                                            $and: [
                                                { $eq: ["$$this.cellKey", { $literal: spec.cellKey }] },
                                                { $eq: ["$$this.kind", { $literal: spec.kind }] },
                                                { $eq: ["$$this.format", { $literal: spec.format }] },
                                            ],
                                        },
                                    },
                                },
                            },
                            [{ $literal: image }],
                        ],
                    },
                },
            },
        ]);

        await updateJob(runId, job.cellKey, job.startedAt, { $inc: { "imageJobs.$[job].completed": 1 } });
    } catch (error) {
        const message = readableError(error);
        console.error(`creativeImageService: ${spec.slotId} for run ${runId} failed:`, message);
        await updateJob(runId, job.cellKey, job.startedAt, {
            $inc: { "imageJobs.$[job].failed": 1 },
            $push: { "imageJobs.$[job].problems": { slot: spec.label, message } },
        }).catch(() => {});
    }
}

async function processImageJob({ runId, specs, provider, userId, job }) {
    try {
        await runPool(specs, CREATIVE_CONFIG.concurrency, (spec) =>
            makeOneImage({ runId, spec, provider, userId, job })
        );

        const run = await MarketingRun.findById(runId).select("imageJobs").lean();
        const finished = run?.imageJobs?.find(
            (j) => j.cellKey === job.cellKey && new Date(j.startedAt).getTime() === job.startedAt.getTime()
        );
        const status = finished && finished.completed > 0 ? IMAGE_JOB_STATUS.DONE : IMAGE_JOB_STATUS.FAILED;

        await updateJob(runId, job.cellKey, job.startedAt, {
            $set: { "imageJobs.$[job].status": status, "imageJobs.$[job].finishedAt": new Date() },
        });
    } catch (error) {
        console.error(`creativeImageService: image job for run ${runId} failed:`, error?.message || error);
        await updateJob(runId, job.cellKey, job.startedAt, {
            $set: { "imageJobs.$[job].status": IMAGE_JOB_STATUS.FAILED, "imageJobs.$[job].finishedAt": new Date() },
            $push: { "imageJobs.$[job].problems": { slot: "All images", message: readableError(error) } },
        }).catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * The admin's photo choice: up to MAX_TEMPLATE_PHOTOS of THIS property's photos,
 * in order. Anything else is rejected, so no outside image can get in.
 * @returns {string[]} [] = use the default order
 */
function normalizePhotoChoice(photos, run) {
    if (photos == null) return [];
    if (!Array.isArray(photos) || photos.some((p) => typeof p !== "string")) {
        throw new Errorhandler("photos must be a list of the property's photo URLs", 400);
    }
    if (photos.length > MAX_TEMPLATE_PHOTOS) {
        throw new Errorhandler(`Pick at most ${MAX_TEMPLATE_PHOTOS} photos`, 400);
    }
    const own = new Set(propertyPhotos(run));
    if (photos.some((p) => !own.has(p))) {
        throw new Errorhandler("Only this property's own photos can be used", 400);
    }
    return photos;
}

/** A picked template must exist and be active; templates need the hybrid provider. */
async function assertTemplateUsable(templateId, provider) {
    if (!templateId) return;
    if (provider.name !== IMAGE_PROVIDERS.HYBRID) {
        throw new Errorhandler("Templates only work with the hybrid image provider (MARKETING_IMAGE_PROVIDER=hybrid)", 400);
    }
    if (templateService.isBuiltIn(templateId)) return;
    const template = await templateService.getTemplate(templateId);
    if (template.status !== TEMPLATE_STATUS.ACTIVE) {
        throw new Errorhandler("This template is archived. Restore it or pick another one.", 400);
    }
}

/**
 * Start image generation for one ad set. Pass slotIds (e.g. ["staticA|1:1"])
 * to regenerate only those images, templateId to use a template from the
 * library instead of each slot's default, and photos to choose which property
 * photos fill {{photo.1}}, {{photo.2}} ... (default: the property's own order).
 *
 * @returns {Promise<object>} the new image job
 */
async function startCellImages({ runId, cellKey, slotIds, templateId, photos, userId }) {
    if (!mongoose.isValidObjectId(runId)) throw new Errorhandler("Invalid run id", 400);
    if (slotIds != null) {
        const known = new Set(allSlotIds());
        if (!Array.isArray(slotIds) || !slotIds.length || !slotIds.every((s) => known.has(s))) {
            throw new Errorhandler("slotIds must be a list of image slots", 400);
        }
    }

    const run = await MarketingRun.findById(runId).lean();
    if (!run) throw new Errorhandler("Marketing run not found", 404);
    if (run.status !== RUN_STATUS.READY) {
        throw new Errorhandler("Images can only be made for a run that is ready for review", 400);
    }
    if (!findCell(run, cellKey)) throw new Errorhandler("Ad set not found in this run", 404);

    const provider = getCreativeProvider();
    const chosenTemplateId = typeof templateId === "string" && templateId.trim() ? templateId.trim() : "";
    await assertTemplateUsable(chosenTemplateId, provider);

    const chosenPhotos = normalizePhotoChoice(photos, run);

    const planned = planCellImages(run, cellKey, { slotIds, photos: chosenPhotos });
    const specs = planned.specs.map((spec) => ({ ...spec, templateId: chosenTemplateId || null }));
    const { skipped } = planned;
    if (!specs.length) {
        const reasons = [...new Set(skipped.map((s) => s.reason))].join("; ");
        throw new Errorhandler(`No images can be made for this ad set: ${reasons || "nothing to make"}`, 400);
    }

    const job = {
        cellKey,
        status: IMAGE_JOB_STATUS.RUNNING,
        total: specs.length,
        completed: 0,
        failed: 0,
        problems: skipped.map((s) => ({ slot: s.label, message: s.reason })),
        templateId: chosenTemplateId,
        photos: chosenPhotos,
        startedBy: userId,
        startedAt: new Date(),
        finishedAt: null,
    };

    // Replace this cell's job, but only if the run is still ready and no
    // live job is running for the cell (a stale one may be replaced).
    const result = await MarketingRun.updateOne(
        {
            _id: runId,
            status: RUN_STATUS.READY,
            imageJobs: {
                $not: { $elemMatch: { cellKey, status: IMAGE_JOB_STATUS.RUNNING, startedAt: { $gt: staleCutoff() } } },
            },
        },
        [
            {
                $set: {
                    imageJobs: {
                        $concatArrays: [
                            {
                                $filter: {
                                    input: { $ifNull: ["$imageJobs", []] },
                                    cond: { $ne: ["$$this.cellKey", { $literal: cellKey }] },
                                },
                            },
                            [{ $literal: job }],
                        ],
                    },
                },
            },
        ]
    );
    if (!result.modifiedCount) {
        throw new Errorhandler("Images are already being made for this ad set", 409);
    }

    // Background processing; processImageJob never throws.
    setImmediate(() => processImageJob({ runId, specs, provider, userId, job }));

    return job;
}

/**
 * Quick look at one ad image with a template and photo choice, WITHOUT the AI
 * (the real photo stands in for the AI background). Nothing is saved.
 *
 * @returns {Promise<{ image: string, label: string }>} PNG data URI
 */
async function previewCellImage({ runId, cellKey, templateId, photos, format = "1:1" }) {
    if (!mongoose.isValidObjectId(runId)) throw new Errorhandler("Invalid run id", 400);
    const run = await MarketingRun.findById(runId).lean();
    if (!run) throw new Errorhandler("Marketing run not found", 404);
    if (!findCell(run, cellKey)) throw new Errorhandler("Ad set not found in this run", 404);

    const provider = getCreativeProvider();
    if (typeof provider.preview !== "function") {
        throw new Errorhandler("Previews need the hybrid image provider (MARKETING_IMAGE_PROVIDER=hybrid)", 400);
    }
    const chosenTemplateId = typeof templateId === "string" && templateId.trim() ? templateId.trim() : "";
    await assertTemplateUsable(chosenTemplateId, provider);

    const { specs } = planCellImages(run, cellKey, { photos: normalizePhotoChoice(photos, run) });
    // First image in this size that shows a photo (else any image in this size).
    const inFormat = specs.filter((s) => s.format === format);
    const spec = inFormat.find((s) => s.photos.length) || inFormat[0];
    if (!spec) throw new Errorhandler("No image of this ad set can be previewed yet", 400);

    const { source } = await provider.preview({ ...spec, templateId: chosenTemplateId || null });
    return { image: source, label: spec.label };
}

/** True when any cell of the run has a live (not stale) image job. */
function hasActiveImageJob(run) {
    return (run.imageJobs || []).some(isJobActive);
}

/**
 * Read-only view for the review screen: each image gets `outdated`, and a
 * job cut off by a restart is shown as failed (the next start replaces it).
 */
function withImageState(run) {
    const imageJobs = (run.imageJobs || []).map((job) =>
        job.status === IMAGE_JOB_STATUS.RUNNING && !isJobActive(job)
            ? { ...job, status: IMAGE_JOB_STATUS.FAILED, problems: [...(job.problems || []), { slot: "All images", message: STALE_MESSAGE }] }
            : job
    );
    const images = (run.images || []).map((image) => ({ ...image, outdated: isImageOutdated(run, image) }));
    return { ...run, images, imageJobs };
}

module.exports = {
    startCellImages,
    previewCellImage,
    hasActiveImageJob,
    withImageState,
};
