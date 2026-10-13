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

const mongoose = require("mongoose");
const productModel = require("../../model/property/productModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { validateAttributes } = require("../../config/adsLoop/attributeTags");
const { nextConceptLtId } = require("./loopState");
const { conceptOf, nextVariantId, cardId, threadTitle } = require("./ltId");
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

/** Statics: { "1x1": url, "4x5": url }; carousels: { "LT-0005-c1": { "1x1": url } ... } */
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

const setCreative = (ltId, update) => AdCreative.updateOne({ ltId }, update);

// ---------------------------------------------------------------------------
// Slack review message
// ---------------------------------------------------------------------------
function reviewBlocks(creative, property) {
    const title = threadTitle(creative.ltId, propertyLabel(property), creative.version);
    const a = creative.attributes || {};
    const blocks = [B.section(`*${title}*\n${creative.concept || ""}`)];

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
            B.button("Approve + post organically", "creative_approve_post", creative.ltId, "primary"),
            B.button("Approve (ads only)", "creative_approve", creative.ltId),
            B.button("Reject", "creative_reject", creative.ltId, "danger"),
        ])
    );
    return { text: title, blocks };
}

async function postForReview(ltId) {
    const creative = await AdCreative.findOne({ ltId }).lean();
    const property = await loadProperty(creative.property);
    const { creativeReviewChannel } = getAdsLoopConfig().slack;
    const message = reviewBlocks(creative, property);

    if (creative.slack?.threadTs) {
        await slack.postMessage({ channel: creative.slack.channel, threadTs: creative.slack.threadTs, ...message });
    } else {
        const posted = await slack.postMessage({ channel: creativeReviewChannel, ...message });
        await setCreative(ltId, { $set: { "slack.channel": posted.channel, "slack.threadTs": posted.ts } });
    }
    await setCreative(ltId, { $set: { status: CREATIVE_STATUS.IN_REVIEW, error: "" } });
}

// ---------------------------------------------------------------------------
// Build one version (with critic and one automatic revision)
// ---------------------------------------------------------------------------
async function buildVersion({ creative, property, plan, notes, previous }) {
    const photos = propertyPhotos(property);
    const ordered = plan.photoIndexes.length ? plan.photoIndexes.map((i) => photos[i]).filter(Boolean) : photos;
    // Carousel cards point at their own photo; give them all, in index order.
    const photoUrls = plan.attributes.format === "carousel" ? photos.slice(0, 6) : ordered.length ? ordered : photos;
    const format = plan.attributes.format;
    const ids = format === "carousel" ? plan.cards.map((_, i) => cardId(creative.ltId, i + 1)) : [creative.ltId];

    const renderOnce = async (build, version) =>
        renderAndUpload({ ltId: creative.ltId, format, build, photos: photoUrls, folder: creative.cloudinaryFolder, version, cardIds: ids });
    const urlsOf = (r) => r.flatMap((c) => (format === "carousel" ? [c.assetUrls["1x1"]] : [c.assetUrls["1x1"], c.assetUrls["4x5"]])).filter(Boolean);

    // Copy policy (QA) on every word: Meta copy, card copy and the text on the image.
    const policyOf = (build) =>
        copyPolicyProblems(
            [build.headline, build.primaryText, ...plan.cards.flatMap((c) => [c.headline, c.description]), ...build.canvases.map(visibleText)],
            property
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
async function processCreative(ltId) {
    let creative;
    try {
        creative = await AdCreative.findOne({ ltId }).lean();
        if (!creative || creative.status !== CREATIVE_STATUS.BUILDING) return;
        const property = await loadProperty(creative.property);

        let plan = creative.plan;
        if (!plan) {
            const base = creative.parentLtId ? await AdCreative.findOne({ ltId: creative.parentLtId }).lean() : null;
            plan = await planCreative({ property, brief: creative.brief, base });
            const { problems } = validateAttributes(plan.attributes);
            if (problems.length) throw new Error(`Plan used unknown tags: ${problems.join("; ")}`);
            await setCreative(ltId, {
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

        await setCreative(ltId, {
            $set: {
                css: version.css,
                cards: version.cards,
                copy: version.copy,
                assetUrls: version.assetUrls,
                critic: version.critic,
                pendingNotes: "",
            },
        });
        await postForReview(ltId);
    } catch (error) {
        const message = error?.message || "Build failed";
        console.error(`[adsLoop] build ${ltId} failed:`, message);
        await setCreative(ltId, { $set: { status: CREATIVE_STATUS.FAILED, error: message } }).catch(() => {});
        const channel = creative?.slack?.channel || getAdsLoopConfig().slack.creativeReviewChannel;
        await slack.replyInThread(channel, creative?.slack?.threadTs, `⚠️ ${ltId}: the build failed: ${message}`);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Start a new creative for a property. With `parentLtId` it becomes a variant
 * (LT-0004-a); otherwise a new concept (LT-0005).
 *
 * @param {object} p
 * @param {string} p.propertyId
 * @param {string} [p.parentLtId]
 * @param {object} [p.brief]       { kind, rationale, attributes } from a proposal
 * @param {string} [p.proposalId]
 * @param {string} [p.requestedBy]
 */
async function startCreative({ propertyId, parentLtId = null, brief = null, proposalId = null }) {
    if (!mongoose.isValidObjectId(propertyId)) throw new Error("Invalid property id");
    const property = await loadProperty(propertyId);
    if (!property.slug) throw new Error("The property has no slug, so it has no auction page to send ads to");
    if (!propertyPhotos(property).length) throw new Error("The property has no photos to build an ad from");

    let ltId;
    if (parentLtId) {
        const siblings = await AdCreative.find({ ltId: new RegExp(`^${conceptOf(parentLtId)}(-[a-z])?$`) }).select("ltId").lean();
        if (!siblings.length) throw new Error(`${parentLtId} not found`);
        ltId = nextVariantId(parentLtId, siblings.map((s) => s.ltId));
    } else {
        ltId = await nextConceptLtId();
    }

    const creative = await AdCreative.create({
        ltId,
        property: property._id,
        propertySlug: property.slug,
        parentLtId,
        attributes: brief?.attributes || {},
        status: CREATIVE_STATUS.BUILDING,
        proposalId,
        brief,
        cloudinaryFolder: newFolder(),
        version: 1,
    });

    setImmediate(() => processCreative(ltId));
    return creative.toObject();
}

/** A reviewer replied in the thread: build the next version with their notes. */
async function reviseCreative({ ltId, notes }) {
    const updated = await AdCreative.findOneAndUpdate(
        { ltId, status: CREATIVE_STATUS.IN_REVIEW },
        {
            $set: { status: CREATIVE_STATUS.BUILDING, pendingNotes: notes },
            $inc: { version: 1, revisionCount: 1 },
            $push: { notesHistory: notes },
        },
        { new: true }
    ).lean();
    if (!updated) return null;
    setImmediate(() => processCreative(ltId));
    return updated;
}

/** Restart a failed build (same version and notes). */
async function retryCreative(ltId) {
    const updated = await AdCreative.findOneAndUpdate(
        { ltId, status: CREATIVE_STATUS.FAILED },
        { $set: { status: CREATIVE_STATUS.BUILDING, error: "" } },
        { new: true }
    ).lean();
    if (updated) setImmediate(() => processCreative(ltId));
    return updated;
}

/** Throws a GuardrailError when any copy of the creative (Meta copy, card copy, image text) fails the policy check. */
async function assertCopyClean(creative) {
    const property = await loadProperty(creative.property);
    const problems = copyPolicyProblems([...allCopy(creative), ...(creative.cards || []).map((c) => visibleText(c.html))], property);
    if (problems.length) throw new GuardrailError(`${creative.ltId} fails the copy policy check: ${problems.join("; ")}`);
}

/** After a restart, builds that were cut off are run again. */
async function recoverBuilds() {
    const stuck = await AdCreative.find({ status: CREATIVE_STATUS.BUILDING }).select("ltId").lean();
    for (const c of stuck) setImmediate(() => processCreative(c.ltId));
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
    reviewImageUrls,
    allCopy,
    propertyLabel,
};
