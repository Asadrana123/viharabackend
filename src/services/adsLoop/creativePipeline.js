// services/adsLoop/creativePipeline.js
//
// Steps 4-5 of the loop: build a creative and get it into #creative-review.
//
//   plan (Claude) -> build HTML/CSS (Claude) -> render PNGs -> upload
//   -> copy policy check + vision critic -> below the bar: ONE automatic
//      revision with the critic's notes -> post to #creative-review
//
// A reply in the review thread starts the next version (v2, v3 ...) with the
// reply as notes. Builds run in the background; the Slack thread shows
// progress and errors. Each version keeps its own image URLs.
//
// Naming: the core id (BB449-S01) is fixed when the creative is started. The
// name gets its stage prefix when posted: CR- for the first post, R1-, R2- ...
// for each version built from thread feedback (AP- is set on Approve).

const mongoose = require("mongoose");
const productModel = require("../../model/property/productModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { validateAttributes } = require("../../config/adsLoop/attributeTags");
const { nextCoreId } = require("./loopState");
const { cardId, nameOf, revisionStage, STAGES } = require("./creativeId");
const { planCreative, buildCreative, critiqueCreative, propertyPhotos } = require("./creativeAi");
const { renderAndUpload, newFolder } = require("./creativeRender");
const { copyPolicyProblems, GuardrailError } = require("./guardrails");
const slack = require("./slackBot");

const { blocks: B } = slack;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const propertyLabel = (p) => p?.street || p?.productName || "Property";

async function loadProperty(id) {
    const property = await productModel.findById(id).lean();
    if (!property) throw new Error("The property no longer exists");
    return property;
}

function allCopy(creative) {
    return [
        creative.copy?.headline,
        creative.copy?.primaryText,
        creative.copy?.overlayText,
        ...(creative.cards || []).flatMap((c) => [c.headline, c.description]),
    ];
}

/** Statics: { "1x1": url, "4x5": url }; carousels: { "BB449-C01-c1": { "1x1": url } ... } */
function flatAssetUrls(format, rendered) {
    if (format !== "carousel") return rendered[0]?.assetUrls || {};
    return Object.fromEntries(rendered.map((r) => [r.cardId, r.assetUrls]));
}

/** One image per canvas for the critic and the "previous version" input: 1x1 of each, plus 4x5 of a static. */
function reviewImageUrls(creative) {
    const cards = creative.cards || [];
    const firstRatio = (c) => c.assetUrls?.get?.("1x1") || c.assetUrls?.["1x1"];
    const urls = cards.map(firstRatio).filter(Boolean);
    if (creative.attributes?.format !== "carousel") {
        const tall = cards[0]?.assetUrls?.get?.("4x5") || cards[0]?.assetUrls?.["4x5"];
        if (tall) urls.push(tall);
    }
    return urls;
}

const setCreative = (coreId, update) => AdCreative.updateOne({ coreId }, update);

/**
 * Give the creative its stage name (CR-, R1-, AP-) and record the rename.
 * @returns {Promise<string>} the new name
 */
async function rename(coreId, stage, { by = "", version = null } = {}) {
    const name = nameOf(stage, coreId);
    await AdCreative.updateOne(
        { coreId },
        { $set: { name, stage }, $push: { nameHistory: { name, stage, version, at: new Date(), by } } }
    );
    return name;
}

// ---------------------------------------------------------------------------
// Slack review message
// ---------------------------------------------------------------------------
function reviewBlocks(creative, property) {
    // The post's text is the current name only (R1-BB449-S01).
    const title = creative.name || creative.coreId;
    const a = creative.attributes || {};
    const blocks = [
        B.section(`*${title}*`),
        B.context(`${propertyLabel(property)} · v${creative.version}${creative.concept ? ` · ${creative.concept}` : ""}`),
    ];

    for (const card of creative.cards || []) {
        const urls = card.assetUrls instanceof Map ? Object.fromEntries(card.assetUrls) : card.assetUrls || {};
        for (const [ratio, url] of Object.entries(urls)) {
            blocks.push(B.image(url, `${card.cardId} ${ratio}`));
        }
        if (a.format === "carousel") blocks.push(B.context(`*${card.cardId}* · ${card.headline} · ${card.description}`));
    }

    blocks.push(
        B.section(`*Headline:* ${creative.copy.headline}\n*Primary text:* ${creative.copy.primaryText}`),
        B.context(
            `${Object.entries(a).map(([k, v]) => `${k}: ${v}`).join(" · ")}` +
                `\nCritic: ${creative.critic?.score ?? "–"}/10${creative.critic?.autoRevised ? " (after one automatic revision)" : ""}` +
                (creative.critic?.notes?.length ? `\nCritic notes: ${creative.critic.notes.slice(0, 3).join(" / ")}` : "")
        ),
        B.context("Reply in this thread with changes to get the next version."),
        B.actions([
            B.button("Approve + post organically", "creative_approve_post", creative.coreId, "primary"),
            B.button("Approve (ads only)", "creative_approve", creative.coreId),
            B.button("Reject", "creative_reject", creative.coreId, "danger"),
        ])
    );
    return { text: title, blocks };
}

async function postForReview(coreId) {
    const before = await AdCreative.findOne({ coreId }).select("slack revisionCount version").lean();
    // First post -> CR-; a version built from thread feedback -> R<round>-.
    const stage = before.slack?.threadTs && before.revisionCount > 0 ? revisionStage(before.revisionCount) : STAGES.CR;
    await rename(coreId, stage, { version: before.version });

    const creative = await AdCreative.findOne({ coreId }).lean();
    const property = await loadProperty(creative.property);
    const { creativeReviewChannel } = getAdsLoopConfig().slack;
    const message = reviewBlocks(creative, property);

    if (creative.slack?.threadTs) {
        await slack.postMessage({ channel: creative.slack.channel, threadTs: creative.slack.threadTs, ...message });
    } else {
        const posted = await slack.postMessage({ channel: creativeReviewChannel, ...message });
        await setCreative(coreId, { $set: { "slack.channel": posted.channel, "slack.threadTs": posted.ts } });
    }
    await setCreative(coreId, { $set: { status: CREATIVE_STATUS.IN_REVIEW, error: "" } });
}

// ---------------------------------------------------------------------------
// Build one version (with critic and one automatic revision)
// ---------------------------------------------------------------------------
async function buildVersion({ creative, property, plan, notes, previous }) {
    const record = creative.sourceRecord || null;
    const photos = propertyPhotos(property);
    const ordered = plan.photoIndexes.length ? plan.photoIndexes.map((i) => photos[i]).filter(Boolean) : photos;
    // Carousel cards point at their own photo; give them all, in index order.
    const photoUrls = plan.attributes.format === "carousel" ? photos.slice(0, 6) : ordered.length ? ordered : photos;
    const format = plan.attributes.format;
    const ids = format === "carousel" ? plan.cards.map((_, i) => cardId(creative.coreId, i + 1)) : [creative.coreId];

    const renderOnce = async (build, version) =>
        renderAndUpload({ coreId: creative.coreId, format, build, photos: photoUrls, folder: creative.cloudinaryFolder, version, cardIds: ids });
    const urlsOf = (r) => r.flatMap((c) => (format === "carousel" ? [c.assetUrls["1x1"]] : [c.assetUrls["1x1"], c.assetUrls["4x5"]])).filter(Boolean);

    // Copy policy (QA) on every word: Meta copy, card copy and the text on the image.
    const policyOf = (build) =>
        copyPolicyProblems(
            [build.headline, build.primaryText, ...plan.cards.flatMap((c) => [c.headline, c.description]), ...build.canvases.map(visibleText)],
            property,
            record
        );

    const buildAndReview = async (revision, version) => {
        const build = await buildCreative({ property, plan, photoUrls, revision });
        const rendered = await renderOnce(build, version);
        const critic = await critiqueCreative({ property, plan, imageUrls: urlsOf(rendered) });
        const policy = policyOf(build);
        return { build, rendered, critic, policy, passed: critic.passed && !policy.length };
    };

    let result = await buildAndReview(previous ? { ...previous, notes } : null, creative.version);
    let autoRevised = false;

    if (!result.passed) {
        // One automatic revision with the critic's and the policy check's notes before people see it.
        const fixes = [
            ...result.policy.map((p) => `Copy policy (must fix): ${p}`),
            ...result.critic.ruleViolations.map((r) => `Breaks rule: ${r}`),
            ...result.critic.notes,
        ].join("\n");
        result = await buildAndReview(
            {
                notes: [notes, `Art director notes:\n${fixes}`].filter(Boolean).join("\n\n"),
                previousImageUrls: urlsOf(result.rendered),
                previousCss: result.build.css,
                previousCanvases: result.build.canvases,
                previousHeadline: result.build.headline,
                previousPrimaryText: result.build.primaryText,
            },
            `${creative.version}r`
        );
        autoRevised = true;
    }

    const { build, rendered, critic, policy } = result;
    const cards = rendered.map((r, i) => ({
        cardId: r.cardId,
        headline: format === "carousel" ? plan.cards[i].headline : build.headline,
        description: format === "carousel" ? plan.cards[i].description : "",
        html: build.canvases[i],
        assetUrls: r.assetUrls,
    }));

    return {
        css: build.css,
        cards,
        copy: { headline: build.headline, primaryText: build.primaryText, overlayText: build.canvases.map(visibleText).join(" / ") },
        assetUrls: flatAssetUrls(format, rendered),
        critic: {
            score: critic.overall,
            passed: result.passed,
            scores: critic.scores,
            notes: [...policy.map((p) => `Copy policy: ${p}`), ...critic.notes],
            ruleViolations: critic.ruleViolations,
            autoRevised,
        },
    };
}

/** The words a canvas shows (tags and CSS removed), for the copy policy check. */
function visibleText(html) {
    return String(html || "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

/** Background job: build the creative's current version and post it. Never throws. */
async function processCreative(coreId) {
    let creative;
    try {
        creative = await AdCreative.findOne({ coreId }).lean();
        if (!creative || creative.status !== CREATIVE_STATUS.BUILDING) return;
        const property = await loadProperty(creative.property);

        let plan = creative.plan;
        if (!plan) {
            const base = creative.parentCoreId ? await AdCreative.findOne({ coreId: creative.parentCoreId }).lean() : null;
            plan = await planCreative({ property, brief: creative.brief, base, format: creative.attributes?.format || "static" });
            const { problems } = validateAttributes(plan.attributes);
            if (problems.length) throw new Error(`Plan used unknown tags: ${problems.join("; ")}`);
            await setCreative(coreId, {
                $set: {
                    plan,
                    attributes: plan.attributes,
                    concept: plan.concept,
                    copy: { headline: plan.headline, primaryText: plan.primaryText, overlayText: plan.overlayText },
                },
            });
        }

        const previous = creative.version > 1 && creative.cards?.length
            ? {
                  previousImageUrls: reviewImageUrls(creative),
                  previousCss: creative.css,
                  previousCanvases: creative.cards.map((c) => c.html),
                  previousHeadline: creative.copy?.headline,
                  previousPrimaryText: creative.copy?.primaryText,
              }
            : null;

        const version = await buildVersion({ creative, property, plan, notes: creative.pendingNotes, previous });

        await setCreative(coreId, {
            $set: {
                css: version.css,
                cards: version.cards,
                copy: version.copy,
                assetUrls: version.assetUrls,
                critic: version.critic,
                pendingNotes: "",
            },
        });
        await postForReview(coreId);
    } catch (error) {
        const message = error?.message || "Build failed";
        console.error(`[adsLoop] build ${coreId} failed:`, message);
        await setCreative(coreId, { $set: { status: CREATIVE_STATUS.FAILED, error: message } }).catch(() => {});
        const channel = creative?.slack?.channel || getAdsLoopConfig().slack.creativeReviewChannel;
        await slack.replyInThread(channel, creative?.slack?.threadTs, `⚠️ ${coreId}: the build failed: ${message}`);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const FORMATS = ["static", "carousel"];
const CORE_ID_RETRIES = 3;

/**
 * Start a new creative for a property. It gets the next free core id for the
 * property and format (BB449-S02). With `parentCoreId` it is a variant or
 * refresh of that creative: a new core id, linked to its parent.
 *
 * @param {object} p
 * @param {string} p.propertyId
 * @param {"static"|"carousel"} [p.format]  default: the brief's format, the parent's, else static
 * @param {string} [p.parentCoreId]
 * @param {object} [p.brief]       { kind, rationale, attributes } from a proposal
 * @param {string} [p.proposalId]
 */
async function startCreative({ propertyId, format = null, parentCoreId = null, brief = null, proposalId = null }) {
    if (!mongoose.isValidObjectId(propertyId)) throw new Error("Invalid property id");
    const property = await loadProperty(propertyId);
    if (!property.slug) throw new Error("The property has no slug, so it has no auction page to send ads to");
    if (!propertyPhotos(property).length) throw new Error("The property has no photos to build an ad from");

    let parent = null;
    if (parentCoreId) {
        parent = await AdCreative.findOne({ coreId: parentCoreId }).select("attributes").lean();
        if (!parent) throw new Error(`${parentCoreId} not found`);
    }
    const chosen = format || brief?.attributes?.format || parent?.attributes?.format || "static";
    if (!FORMATS.includes(chosen)) throw new Error(`Format must be static or carousel (got "${chosen}")`);

    for (let attempt = 1; ; attempt++) {
        const { coreId, propertyCode } = await nextCoreId(property, chosen);
        try {
            const creative = await AdCreative.create({
                coreId,
                propertyCode,
                property: property._id,
                propertySlug: property.slug,
                parentCoreId,
                attributes: { ...(brief?.attributes || {}), format: chosen },
                status: CREATIVE_STATUS.BUILDING,
                proposalId,
                brief,
                cloudinaryFolder: newFolder(coreId),
                version: 1,
            });
            setImmediate(() => processCreative(coreId));
            return creative.toObject();
        } catch (error) {
            // Two builds took the same number at once: take the next one.
            if (error?.code !== 11000 || attempt >= CORE_ID_RETRIES) throw error;
        }
    }
}

/** A reviewer replied in the thread: build the next version with their notes. */
async function reviseCreative({ coreId, notes }) {
    const updated = await AdCreative.findOneAndUpdate(
        { coreId, status: CREATIVE_STATUS.IN_REVIEW },
        {
            $set: { status: CREATIVE_STATUS.BUILDING, pendingNotes: notes },
            $inc: { version: 1, revisionCount: 1 },
            $push: { notesHistory: notes },
        },
        { new: true }
    ).lean();
    if (!updated) return null;
    setImmediate(() => processCreative(coreId));
    return updated;
}

/** Restart a failed build (same version and notes). */
async function retryCreative(coreId) {
    const updated = await AdCreative.findOneAndUpdate(
        { coreId, status: CREATIVE_STATUS.FAILED },
        { $set: { status: CREATIVE_STATUS.BUILDING, error: "" } },
        { new: true }
    ).lean();
    if (updated) setImmediate(() => processCreative(coreId));
    return updated;
}

/** Throws a GuardrailError when any copy of the creative (Meta copy, card copy, image text) fails the policy check. */
async function assertCopyClean(creative) {
    const property = await loadProperty(creative.property);
    const problems = copyPolicyProblems(
        [...allCopy(creative), ...(creative.cards || []).map((c) => visibleText(c.html))],
        property,
        creative.sourceRecord
    );
    if (problems.length) throw new GuardrailError(`${creative.coreId} fails the copy policy check: ${problems.join("; ")}`);
}

/** After a restart, builds that were cut off are run again. */
async function recoverBuilds() {
    const stuck = await AdCreative.find({ status: CREATIVE_STATUS.BUILDING }).select("coreId").lean();
    for (const c of stuck) setImmediate(() => processCreative(c.coreId));
    return stuck.length;
}

module.exports = {
    startCreative,
    reviseCreative,
    retryCreative,
    recoverBuilds,
    processCreative,
    buildVersion,
    assertCopyClean,
    rename,
    reviewImageUrls,
    allCopy,
    propertyLabel,
};
