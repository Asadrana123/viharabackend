// services/marketing/creativePlanner.js
//
// PRD Step 6 - decides which ad images one cell (ad set) gets and exactly what
// each image says. Pure code: no AI, no database, no network.
//
// On-image text comes only from:
//   - the brief's exact strings (price line, value gap line, specs ...), and
//   - the cell's Meta copy lines, only when they are real copy with no warnings.
// The image provider draws what is planned here and nothing else.

const {
    CREATIVE_SLOTS,
    IMAGE_SIZES,
    REFERENCE_IMAGES,
} = require("../../config/marketing/creativeConfig");
const {
    BUYER_TYPES,
    CHANNELS,
    GATE_BINS,
    LINE_SOURCES,
} = require("../../config/marketing/marketingConstants");

const TEXT_ROLES = Object.freeze(["headline", "secondaryHeadline", "supportingCopy"]);

// Readable names for brief strings, used in "why was this skipped" messages.
const STRING_LABELS = Object.freeze({
    valueGapLine: "Value gap",
    priceLine: "Starting price",
    estimateLine: "Vihara estimate",
    specsLine: "Beds / baths / sq ft",
    cityState: "City and state",
    auctionDateLine: "Auction date",
});

const toSlotId = (kind, format) => `${kind}|${format}`;

// ---------------------------------------------------------------------------
// Context shared by every slot of one cell
// ---------------------------------------------------------------------------
function buildContext(run, cell) {
    const brief = run.brief || {};

    const lines = new Map();
    (run.lines || []).forEach((l) => {
        if (l.channel === CHANNELS.META && l.cellKey === cell.key) lines.set(`${l.group}.${l.field}`, l);
    });

    const photos = Array.isArray(run.gate?.verified?.photos) ? run.gate.verified.photos : [];

    return {
        cell,
        lines,
        photos,
        strings: brief.strings || {},
        gapVerified: brief.valueGap?.status === GATE_BINS.VERIFIED,
        gapReason: brief.valueGap?.reason || "not verified",
        audience: brief.buyerType === BUYER_TYPES.INVESTOR
            ? "property investors"
            : "people buying a home to live in",
        propertyType: brief.facts?.propertyType || "",
    };
}

/** @returns {{ text: string } | { problem: string }} */
function resolveText(source, slot, ctx) {
    if (source.string) {
        const text = ctx.strings[source.string];
        return text
            ? { text }
            : { problem: `${STRING_LABELS[source.string] || source.string} is not available` };
    }

    const line = ctx.lines.get(`${slot.group}.${source.line}`);
    const name = line?.label || source.line;
    if (!line || !line.text?.trim()) return { problem: `"${name}" has no text` };
    if (line.source === LINE_SOURCES.PLACEHOLDER) return { problem: `"${name}" still needs input` };
    if (line.flags?.length) return { problem: `"${name}" has a compliance warning` };
    return { text: line.text.trim() };
}

/** Stable fingerprint of the on-image text, stored on the image. */
function toTextSnapshot(texts) {
    return JSON.stringify([texts.headline, texts.secondaryHeadline, texts.supportingCopy, texts.cta].map((t) => t || ""));
}

/** @returns {{ spec: object } | { skip: string }} */
function planSlot(slot, format, ctx) {
    const size = IMAGE_SIZES[format];
    if (!size) return { skip: `Unknown image format ${format}` };

    if (slot.requiresValueGap && !ctx.gapVerified) {
        return { skip: `Value gap is blocked (${ctx.gapReason})` };
    }

    const texts = {};
    for (const role of TEXT_ROLES) {
        const source = slot.texts?.[role];
        if (!source) continue;
        const resolved = resolveText(source, slot, ctx);
        if (resolved.text) texts[role] = resolved.text;
        else if (source.required) return { skip: resolved.problem };
    }
    if (slot.showCta && ctx.cell.cta) texts.cta = ctx.cell.cta;

    const photoUrl = slot.photoIndex == null ? null : ctx.photos[slot.photoIndex] || null;

    return {
        spec: {
            slotId: toSlotId(slot.kind, format),
            cellKey: ctx.cell.key,
            kind: slot.kind,
            group: slot.group,
            label: `${slot.label} (${format})`,
            concept: slot.concept,
            format,
            size,
            photoUrl,
            referenceUrls: REFERENCE_IMAGES[slot.group] || [],
            texts,
            audience: ctx.audience,
            propertyType: ctx.propertyType,
            textSnapshot: toTextSnapshot(texts),
        },
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const findCell = (run, cellKey) => (run.cells || []).find((c) => c.key === cellKey) || null;

/** Every slot id a cell can have, buildable or not ("staticA|1:1", ...). */
function allSlotIds() {
    return CREATIVE_SLOTS.flatMap((slot) => slot.formats.map((format) => toSlotId(slot.kind, format)));
}

/**
 * @param {object} run       MarketingRun (lean or document)
 * @param {string} cellKey
 * @param {object} [opts]
 * @param {string[]} [opts.slotIds]  only plan these slots (e.g. one regenerate)
 * @returns {{ specs: object[], skipped: Array<{ slotId: string, label: string, reason: string }> }}
 */
function planCellImages(run, cellKey, { slotIds } = {}) {
    const cell = findCell(run, cellKey);
    if (!cell) return { specs: [], skipped: [] };

    const ctx = buildContext(run, cell);
    const wanted = slotIds ? new Set(slotIds) : null;
    const specs = [];
    const skipped = [];

    CREATIVE_SLOTS.forEach((slot) => {
        slot.formats.forEach((format) => {
            const slotId = toSlotId(slot.kind, format);
            if (wanted && !wanted.has(slotId)) return;

            const result = planSlot(slot, format, ctx);
            if (result.spec) specs.push(result.spec);
            else skipped.push({ slotId, label: `${slot.label} (${format})`, reason: result.skip });
        });
    });

    return { specs, skipped };
}

/**
 * True when a stored image no longer matches what its slot would say now
 * (copy edited, or the slot is no longer buildable).
 */
function isImageOutdated(run, image) {
    const { specs } = planCellImages(run, image.cellKey, { slotIds: [toSlotId(image.kind, image.format)] });
    return !specs.length || specs[0].textSnapshot !== image.textSnapshot;
}

module.exports = {
    planCellImages,
    isImageOutdated,
    findCell,
    allSlotIds,
    toSlotId,
};
