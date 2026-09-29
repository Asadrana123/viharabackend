// services/marketing/templateService.js
//
// Ad template library: upload once, use for any property.
//   - create / edit (every edit is a new immutable version)
//   - list and read
//   - default template per slot
//   - archive / restore (never delete; old images keep their template)
//   - upload template images to Cloudinary
//   - preview a template with sample text before saving it
//   - save library thumbnails for every version (and the built-in design)
//   - resolve which template an image uses
//
// Every template's HTML goes through templateValidator before it is saved.

const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Errorhandler = require("../../utils/errorhandler");
const Template = require("../../model/marketing/marketingTemplateModel");
const { validateTemplateHtml } = require("./templateValidator");
const { buildTemplateDocument, imageUrlsOf, PREVIEW_IMAGE } = require("./templateRenderer");
const { renderHtmlToPng } = require("./htmlRenderer");
const { buildAdHtml } = require("./creativeTemplates");
const { CREATIVE_SLOTS, IMAGE_SIZES } = require("../../config/marketing/creativeConfig");
const {
    TEMPLATE_STATUS,
    TEMPLATE_FORMAT_KEYS,
    TEMPLATE_LIMITS,
    ASSET_MIME_TYPES,
    ASSET_NAME_PATTERN,
    TEMPLATE_ASSET_FOLDER,
    TEMPLATE_PREVIEW_FOLDER,
    BUILTIN_TEMPLATE,
    PREVIEW_TEXTS,
} = require("../../config/marketing/templateConfig");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const SLOT_KINDS = CREATIVE_SLOTS.map((s) => s.kind);
const SUMMARY_FIELDS = "-html";

const isBuiltIn = (id) => id === BUILTIN_TEMPLATE.id;

function assertObjectId(id, label = "template id") {
    if (!mongoose.isValidObjectId(id)) throw new Errorhandler(`Invalid ${label}`, 400);
}

// ---------------------------------------------------------------------------
// Input normalization + validation
// ---------------------------------------------------------------------------
function normalizeSlots(slots) {
    if (slots == null) return [];
    if (!Array.isArray(slots)) throw new Errorhandler("slots must be a list", 400);
    const unique = [...new Set(slots.map(String))];
    const unknown = unique.filter((s) => !SLOT_KINDS.includes(s));
    if (unknown.length) throw new Errorhandler(`Unknown slots: ${unknown.join(", ")}`, 400);
    return unique;
}

// Template images must be ones uploaded through uploadTemplateAsset().
function isOwnAssetUrl(url) {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    return (
        typeof url === "string" &&
        url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`) &&
        url.includes(`/${TEMPLATE_ASSET_FOLDER}/`)
    );
}

function normalizeAssets(assets) {
    if (assets == null) return [];
    if (!Array.isArray(assets)) throw new Errorhandler("assets must be a list", 400);
    if (assets.length > TEMPLATE_LIMITS.maxAssets) {
        throw new Errorhandler(`A template can have at most ${TEMPLATE_LIMITS.maxAssets} images`, 400);
    }

    const names = new Set();
    return assets.map((a) => {
        const name = String(a?.name || "").trim();
        if (!ASSET_NAME_PATTERN.test(name)) {
            throw new Errorhandler(`Image name "${name}" must be 1-40 letters, numbers, "-" or "_"`, 400);
        }
        if (names.has(name)) throw new Errorhandler(`Two images are named "${name}"`, 400);
        names.add(name);
        if (!isOwnAssetUrl(a.url)) {
            throw new Errorhandler(`Image "${name}" must be uploaded through the template image upload`, 400);
        }
        return { name, url: a.url, publicId: String(a.publicId || "") };
    });
}

/**
 * Validate everything the admin sent. Throws 400/422 with every problem listed.
 * @returns {object} clean fields for a new version
 */
function prepareTemplateData(data = {}) {
    const name = String(data.name || "").trim();
    const description = String(data.description || "").trim();
    if (!name) throw new Errorhandler("Template name is required", 400);
    if (name.length > TEMPLATE_LIMITS.maxNameChars) {
        throw new Errorhandler(`Name must be ${TEMPLATE_LIMITS.maxNameChars} characters or fewer`, 400);
    }
    if (description.length > TEMPLATE_LIMITS.maxDescriptionChars) {
        throw new Errorhandler(`Description must be ${TEMPLATE_LIMITS.maxDescriptionChars} characters or fewer`, 400);
    }

    const slots = normalizeSlots(data.slots);
    const assets = normalizeAssets(data.assets);
    const assetNames = assets.map((a) => a.name);

    const square = typeof data.html?.square === "string" ? data.html.square : "";
    const tall = typeof data.html?.tall === "string" ? data.html.tall : "";
    if (!square.trim()) throw new Errorhandler("The 1:1 HTML is required", 400);

    const squareCheck = validateTemplateHtml(square, { assetNames });
    const tallCheck = tall.trim() ? validateTemplateHtml(tall, { assetNames }) : null;

    const errors = [
        ...squareCheck.errors.map((e) => `1:1 - ${e}`),
        ...(tallCheck ? tallCheck.errors.map((e) => `9:16 - ${e}`) : []),
    ];
    if (errors.length) throw new Errorhandler(`Template not saved: ${errors.join("; ")}`, 422);

    return {
        name,
        description,
        slots,
        assets,
        html: { square, tall: tall.trim() ? tall : "" },
        usesBackground: squareCheck.usesBackground || Boolean(tallCheck?.usesBackground),
        usesPhoto: squareCheck.usesPhoto || Boolean(tallCheck?.usesPhoto),
    };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
function builtInSummary(claimedSlots) {
    ensureBuiltInPreview();
    return {
        _id: BUILTIN_TEMPLATE.id,
        builtIn: true,
        name: BUILTIN_TEMPLATE.name,
        description: BUILTIN_TEMPLATE.description,
        status: TEMPLATE_STATUS.ACTIVE,
        version: 1,
        formats: Object.keys(TEMPLATE_FORMAT_KEYS),
        slots: [],
        previewImages: builtInPreview,
        // Default for every slot no uploaded template claims.
        defaultForSlots: SLOT_KINDS.filter((k) => !claimedSlots.has(k)),
    };
}

const formatsOf = (t) => Object.keys(TEMPLATE_FORMAT_KEYS).filter((f) => Boolean(t.html?.[TEMPLATE_FORMAT_KEYS[f]]));

/** Latest version of every template (built-in first). HTML is left out. */
async function listTemplates({ includeArchived = false } = {}) {
    const filter = { isLatest: true };
    if (!includeArchived) filter.status = TEMPLATE_STATUS.ACTIVE;

    const templates = await Template.find(filter)
        .sort({ updatedAt: -1 })
        .populate("createdBy", "name email")
        .lean();

    const claimed = new Set(
        templates.filter((t) => t.status === TEMPLATE_STATUS.ACTIVE).flatMap((t) => t.defaultForSlots || [])
    );

    const summaries = templates.map(({ html, ...t }) => ({ ...t, builtIn: false, formats: formatsOf({ html }) }));
    return [builtInSummary(claimed), ...summaries];
}

/** One version, with its HTML. */
async function getTemplate(templateId) {
    if (isBuiltIn(templateId)) {
        throw new Errorhandler("The built-in template is part of the engine and has no editable HTML", 400);
    }
    assertObjectId(templateId);
    const template = await Template.findById(templateId).populate("createdBy", "name email").lean();
    if (!template) throw new Errorhandler("Template not found", 404);
    return { ...template, builtIn: false, formats: formatsOf(template) };
}

/** Every version of a template, newest first (no HTML). */
async function listTemplateVersions(templateId) {
    const template = await getTemplate(templateId);
    return Template.find({ familyId: template.familyId })
        .select(SUMMARY_FIELDS)
        .sort({ version: -1 })
        .populate("createdBy", "name email")
        .lean();
}

async function findLatestOrThrow(templateId) {
    const template = await getTemplate(templateId);
    const latest = await Template.findOne({ familyId: template.familyId, isLatest: true });
    if (!latest) throw new Errorhandler("Template not found", 404);
    return latest;
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------
async function createTemplate({ data, userId }) {
    const clean = prepareTemplateData(data);
    const previewImages = await storePreviewImages(clean.html, clean.assets);
    const _id = new mongoose.Types.ObjectId();
    const created = await Template.create({ ...clean, previewImages, _id, familyId: _id, version: 1, createdBy: userId });
    return getTemplate(created._id);
}

/**
 * Save an edit as a new version. The old version stays untouched, so images
 * already made with it keep their exact HTML.
 */
async function updateTemplate({ templateId, data, userId }) {
    const latest = await findLatestOrThrow(templateId);
    if (latest.status !== TEMPLATE_STATUS.ACTIVE) {
        throw new Errorhandler("Restore this template before editing it", 400);
    }
    const clean = prepareTemplateData(data);
    const previewImages = await storePreviewImages(clean.html, clean.assets);

    let created;
    try {
        created = await Template.create({
            ...clean,
            previewImages,
            familyId: latest.familyId,
            version: latest.version + 1,
            // Defaults move to the new version, minus slots it no longer supports.
            defaultForSlots: clean.slots.length
                ? latest.defaultForSlots.filter((s) => clean.slots.includes(s))
                : latest.defaultForSlots,
            createdBy: userId,
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw new Errorhandler("Someone else just saved this template. Reload it and try again.", 409);
        }
        throw error;
    }

    await Template.updateOne({ _id: latest._id }, { $set: { isLatest: false, defaultForSlots: [] } });
    return getTemplate(created._id);
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
/**
 * Make a template the default for exactly these slots. Slots it gives up fall
 * back to the built-in template. Passing the built-in id hands the slots back
 * to the built-in template.
 */
async function setTemplateDefaults({ templateId, slots }) {
    const wanted = normalizeSlots(slots);

    if (isBuiltIn(templateId)) {
        if (wanted.length) {
            await Template.updateMany(
                { isLatest: true, defaultForSlots: { $in: wanted } },
                { $pull: { defaultForSlots: { $in: wanted } } }
            );
        }
        return listTemplates();
    }

    const latest = await findLatestOrThrow(templateId);
    if (latest.status !== TEMPLATE_STATUS.ACTIVE) {
        throw new Errorhandler("An archived template can't be a default", 400);
    }
    const unsupported = latest.slots.length ? wanted.filter((s) => !latest.slots.includes(s)) : [];
    if (unsupported.length) {
        throw new Errorhandler(`This template is not made for: ${unsupported.join(", ")}`, 400);
    }

    // One default per slot: take the slots away from any other template first.
    if (wanted.length) {
        await Template.updateMany(
            { _id: { $ne: latest._id }, isLatest: true, defaultForSlots: { $in: wanted } },
            { $pull: { defaultForSlots: { $in: wanted } } }
        );
    }
    await Template.updateOne({ _id: latest._id }, { $set: { defaultForSlots: wanted } });
    return listTemplates();
}

// ---------------------------------------------------------------------------
// Archive / restore
// ---------------------------------------------------------------------------
async function archiveTemplate({ templateId, userId }) {
    const latest = await findLatestOrThrow(templateId);
    latest.status = TEMPLATE_STATUS.ARCHIVED;
    latest.defaultForSlots = [];
    latest.archivedBy = userId;
    latest.archivedAt = new Date();
    await latest.save();
    return getTemplate(latest._id);
}

async function restoreTemplate({ templateId }) {
    const latest = await findLatestOrThrow(templateId);
    latest.status = TEMPLATE_STATUS.ACTIVE;
    latest.archivedBy = null;
    latest.archivedAt = null;
    await latest.save();
    return getTemplate(latest._id);
}

// ---------------------------------------------------------------------------
// Template images
// ---------------------------------------------------------------------------
/**
 * Upload one template image (multer memory file) to Cloudinary.
 * @param {{ buffer: Buffer, mimetype: string, size: number }} file
 * @returns {Promise<{ url: string, publicId: string }>}
 */
async function uploadTemplateAsset(file) {
    if (!file?.buffer) throw new Errorhandler("No image was uploaded", 400);
    if (!ASSET_MIME_TYPES.includes(file.mimetype)) {
        throw new Errorhandler("Template images must be PNG, JPEG or WebP", 400);
    }
    if (file.size > TEMPLATE_LIMITS.maxAssetBytes) {
        throw new Errorhandler(`Template images must be ${TEMPLATE_LIMITS.maxAssetBytes / (1024 * 1024)} MB or smaller`, 400);
    }

    const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: TEMPLATE_ASSET_FOLDER, resource_type: "image" },
            (error, uploaded) => (error ? reject(error) : resolve(uploaded))
        );
        stream.end(file.buffer);
    });

    return { url: result.secure_url, publicId: result.public_id };
}

// ---------------------------------------------------------------------------
// Preview + library thumbnails
// ---------------------------------------------------------------------------
const toDataUri = (png) => `data:image/png;base64,${png.toString("base64")}`;

/** { "1:1": html, "9:16": html|"" } from { square, tall }. */
function htmlByFormat(html = {}) {
    return Object.fromEntries(
        Object.entries(TEMPLATE_FORMAT_KEYS).map(([format, key]) => [format, typeof html[key] === "string" ? html[key] : ""])
    );
}

/** Render every format that has HTML with the sample text. */
async function renderPreviewPngs(html, assets) {
    const images = {
        background: PREVIEW_IMAGE,
        photo: PREVIEW_IMAGE,
        assets: Object.fromEntries(assets.map((a) => [a.name, a.url])),
    };

    const pngs = {};
    for (const [format, formatHtml] of Object.entries(htmlByFormat(html))) {
        if (!formatHtml.trim()) {
            pngs[format] = null;
            continue;
        }
        const size = IMAGE_SIZES[format].final;
        const doc = buildTemplateDocument(formatHtml, { texts: PREVIEW_TEXTS, images, size });
        pngs[format] = await renderHtmlToPng(doc, size, { allowedUrls: imageUrlsOf(images) });
    }
    return pngs;
}

function uploadPng(buffer, options = {}) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: TEMPLATE_PREVIEW_FOLDER, resource_type: "image", ...options },
            (error, uploaded) => (error ? reject(error) : resolve(uploaded.secure_url))
        );
        stream.end(buffer);
    });
}

/**
 * Library thumbnails for a version being saved. A failed render never blocks
 * saving; the card just shows no thumbnail.
 */
async function storePreviewImages(html, assets) {
    try {
        const pngs = await renderPreviewPngs(html, assets);
        return {
            square: pngs["1:1"] ? await uploadPng(pngs["1:1"]) : "",
            tall: pngs["9:16"] ? await uploadPng(pngs["9:16"]) : "",
        };
    } catch (error) {
        console.error("templateService: preview thumbnails failed:", error?.message || error);
        return { square: "", tall: "" };
    }
}

// Built-in design thumbnails: rendered once per server start in the
// background, so listing templates never waits for Chrome.
let builtInPreview = { square: "", tall: "" };
let builtInPreviewPending = null;

function ensureBuiltInPreview() {
    if (builtInPreview.square || builtInPreviewPending) return;
    builtInPreviewPending = (async () => {
        try {
            const result = {};
            for (const [format, key] of Object.entries(TEMPLATE_FORMAT_KEYS)) {
                const spec = { format, size: IMAGE_SIZES[format], texts: PREVIEW_TEXTS };
                const png = await renderHtmlToPng(buildAdHtml(spec, PREVIEW_IMAGE), IMAGE_SIZES[format].final);
                result[key] = await uploadPng(png, { public_id: `${BUILTIN_TEMPLATE.id}-${key}`, overwrite: true, invalidate: true });
            }
            builtInPreview = result;
        } catch (error) {
            console.error("templateService: built-in preview failed:", error?.message || error);
        } finally {
            builtInPreviewPending = null;
        }
    })();
}

/**
 * Render a template with sample text and a sample photo, before or after it
 * is saved. Runs the same validation as saving.
 *
 * @param {object} data  { html: { square, tall }, assets }
 * @returns {Promise<{ "1:1": string, "9:16": string|null }>} PNG data URIs
 */
async function previewTemplate(data = {}) {
    const assets = normalizeAssets(data.assets);
    const assetNames = assets.map((a) => a.name);
    const byFormat = htmlByFormat(data.html);
    if (!byFormat["1:1"].trim()) throw new Errorhandler("The 1:1 HTML is required", 400);

    const errors = [];
    Object.entries(byFormat).forEach(([format, html]) => {
        if (!html.trim()) return;
        validateTemplateHtml(html, { assetNames }).errors.forEach((e) => errors.push(`${format} - ${e}`));
    });
    if (errors.length) throw new Errorhandler(`Template has problems: ${errors.join("; ")}`, 422);

    const pngs = await renderPreviewPngs(data.html, assets);
    return Object.fromEntries(Object.entries(pngs).map(([format, png]) => [format, png ? toDataUri(png) : null]));
}

// ---------------------------------------------------------------------------
// Which template an image uses
// ---------------------------------------------------------------------------
/**
 * Pick the template for one slot + format.
 *   templateId given -> that version (if it supports the slot and format)
 *   none given       -> the slot's default template
 * Falls back to the built-in template when the chosen one has no HTML for the
 * format, isn't made for the slot, or is archived.
 *
 * @returns {Promise<{ builtIn: true } | { builtIn: false, template: object, html: string }>}
 */
async function resolveTemplate({ templateId, slotKind, format }) {
    let template = null;

    if (templateId && !isBuiltIn(templateId)) {
        assertObjectId(templateId);
        template = await Template.findById(templateId).lean();
        if (!template) throw new Errorhandler("Template not found", 404);
    } else if (!templateId) {
        template = await Template.findOne({
            isLatest: true,
            status: TEMPLATE_STATUS.ACTIVE,
            defaultForSlots: slotKind,
        }).lean();
    }

    const html = template?.html?.[TEMPLATE_FORMAT_KEYS[format]];
    const fits =
        template &&
        template.status === TEMPLATE_STATUS.ACTIVE &&
        html &&
        (!template.slots.length || template.slots.includes(slotKind));

    return fits ? { builtIn: false, template, html } : { builtIn: true };
}

module.exports = {
    listTemplates,
    getTemplate,
    listTemplateVersions,
    createTemplate,
    updateTemplate,
    setTemplateDefaults,
    archiveTemplate,
    restoreTemplate,
    uploadTemplateAsset,
    previewTemplate,
    resolveTemplate,
    prepareTemplateData,
    isBuiltIn,
};
