// services/marketing/creativeEstimateService.js
//
// The Studio's Estimate page (vihara.ai/studio/estimate): an editor uploads a video, a static or a
// carousel (or picks a Studio video), says who it is for and the budget, and gets
//   1. numbers right away: impressions, clicks, leads with a range, from our own past Meta ads
//      (creativeEstimateModel.js, no AI), and
//   2. a minute later, the AI's check of the creative (creativeReviewService.js).
// Every estimate is kept; once someone links it to the real Meta ad, the page shows guess vs real.
//
// Past ads come from Zernio (GET /v1/ads, last PAST_DAYS days), cached for HISTORY_TTL_MS. Ads
// with no tags yet are tagged in the background, so a new ad gets its buyer type a few minutes
// after the first load that sees it.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const zernio = require("../adsLoop/zernioClient");
const model = require("./creativeEstimateModel");
const review = require("./creativeReviewService");
const { GEMINI_MODEL } = require("../geminiModel");
const { BUYER_TYPES } = require("../studio/runService");
const cutStorage = require("../studio/cutStorage");
const CreativeAdTag = require("../../model/marketing/creativeAdTagModel");
const CreativeEstimate = require("../../model/marketing/creativeEstimateRecordModel");

const PAST_DAYS = 365;
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const REVIEW_STALE_MS = 15 * 60 * 1000;
const MAX_BUDGET = 5000;
const MAX_DAYS = 60;
const MAX_TEXT = 2000;
const MAX_TITLE = 120;
const LINKABLE_DAYS = 90;

const VIDEO_TYPES = { "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm" };
const IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MAX_CAROUSEL = 10;

// ---------------------------------------------------------------------------
// Past ads
// ---------------------------------------------------------------------------

let historyCache = null; // { at, rows, test, ads }
let historyLoading = null;
let tagging = null;

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Tags the ads that have none yet, one run at a time, in the background. */
function tagMissing(ads, tagged) {
    if (tagging || !review.geminiConfigured()) return;
    const missing = ads.filter((a) => a.platformAdId && !tagged.has(String(a.platformAdId)));
    if (!missing.length) return;
    tagging = (async () => {
        const tags = await review.tagPastAds(missing);
        if (!tags.length) return;
        // $setOnInsert: an admin's correction is never overwritten.
        await CreativeAdTag.bulkWrite(
            tags.map((t) => ({ updateOne: { filter: { adId: t.adId }, update: { $setOnInsert: { adId: t.adId, buyerType: t.buyerType, state: t.state, source: "ai", model: GEMINI_MODEL } }, upsert: true } }))
        );
        historyCache = null; // the next load sees the new tags
        console.log(`[creative-estimate] tagged ${tags.length} of ${missing.length} new past ads`);
    })()
        .catch((e) => console.error(`[creative-estimate] tagging failed: ${e.message}`))
        .finally(() => {
            tagging = null;
        });
}

async function buildHistory() {
    const now = new Date();
    const since = new Date(now.getTime() - PAST_DAYS * 86400000);
    const ads = await zernio.listAds({ fromDate: isoDay(since), toDate: isoDay(now) });
    const tags = await CreativeAdTag.find({}).lean();
    const byAd = new Map(tags.map((t) => [t.adId, t]));
    const rows = ads.map((a) => model.adRow(a, byAd.get(String(a.platformAdId)) || {}));
    tagMissing(ads, byAd);
    return { at: Date.now(), rows, test: model.backtest(rows), ads };
}

/** Past ads as model rows, plus the backtest. Cached; one load at a time. */
async function loadHistory({ fresh = false } = {}) {
    if (!fresh && historyCache && Date.now() - historyCache.at < HISTORY_TTL_MS) return historyCache;
    if (!historyLoading) {
        historyLoading = buildHistory()
            .then((h) => {
                historyCache = h;
                return h;
            })
            .finally(() => {
                historyLoading = null;
            });
    }
    return historyLoading;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

class InputError extends Error {}

/** The format the files make: one video, one image, or 2-10 images (a carousel). */
function formatOfFiles(files) {
    if (!files.length) throw new InputError("Add the video, the image, or the carousel's images.");
    const videos = files.filter((f) => VIDEO_TYPES[f.mimeType]);
    const images = files.filter((f) => IMAGE_TYPES[f.mimeType]);
    if (videos.length + images.length !== files.length) throw new InputError("Use .mp4, .mov or .webm for videos and .jpg, .png or .webp for images.");
    if (videos.length > 1) throw new InputError("Add one video at a time.");
    if (videos.length && images.length) throw new InputError("Add either one video or images, not both.");
    if (videos.length) return "video";
    if (images.length > MAX_CAROUSEL) throw new InputError(`A carousel has at most ${MAX_CAROUSEL} cards.`);
    return images.length === 1 ? "image" : "carousel";
}

/** Checks what the page sent. Files are checked by formatOfFiles. */
function cleanInput(body) {
    const leadPlace = String(body?.leadPlace ?? "");
    if (!model.LEAD_PLACES.includes(leadPlace)) throw new InputError("Choose where people fill in the form: a Meta form or our website.");
    const buyerType = body?.buyerType ? String(body.buyerType) : null;
    if (buyerType && !BUYER_TYPES.some((b) => b.id === buyerType)) throw new InputError("Choose one of the buyer types.");
    const dailyBudget = Number(body?.dailyBudget);
    if (!Number.isFinite(dailyBudget) || dailyBudget < 1 || dailyBudget > MAX_BUDGET) throw new InputError(`Daily budget is $1 to $${MAX_BUDGET}.`);
    const days = Number(body?.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new InputError(`Days is a whole number from 1 to ${MAX_DAYS}.`);
    const adText = String(body?.adText ?? "").trim();
    if (adText.length > MAX_TEXT) throw new InputError(`Keep the ad text under ${MAX_TEXT} characters.`);
    const title = String(body?.title ?? "").trim().slice(0, MAX_TITLE);
    return { leadPlace, buyerType, dailyBudget: Math.round(dailyBudget * 100) / 100, days, adText, title };
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

const buyerLabel = (id) => BUYER_TYPES.find((b) => b.id === id)?.label || "";

/** Numbers for one target from the cached history. */
async function numbersFor(target, plan) {
    const h = await loadHistory();
    return model.buildEstimate(h.rows, target, plan, h.test);
}

/**
 * Makes an estimate: numbers now, the AI check in the background.
 * @param {{ user, byName, body, files: Array<{ path, name, mimeType, bytes }>, studioVideo? }} args
 *   files are temp files; this takes them over and deletes them when done.
 */
async function createEstimate({ user, byName, body, files, studioVideo = null }) {
    const input = cleanInput(body);
    const format = formatOfFiles(files);
    const target = { format, leadPlace: input.leadPlace, buyerType: input.buyerType };
    const estimate = await numbersFor(target, { dailyBudget: input.dailyBudget, days: input.days });

    const record = await CreativeEstimate.create({
        createdBy: user._id,
        byName,
        title: input.title || studioVideo?.name || files[0].name,
        format,
        leadPlace: input.leadPlace,
        buyerType: input.buyerType,
        dailyBudget: input.dailyBudget,
        days: input.days,
        adText: input.adText,
        studioCoreId: studioVideo?.coreId || null,
        estimate,
        reviewState: "pending",
    });

    // In the background: keep the files, then the AI check. The page polls for it.
    runReview(record._id, { format, files, adText: input.adText, buyerType: input.buyerType, studioVideo }).catch((e) =>
        console.error(`[creative-estimate] ${record._id}: ${e.message}`)
    );
    return record.toObject();
}

async function runReview(id, { format, files, adText, buyerType, studioVideo }) {
    const stored = [];
    try {
        if (studioVideo?.cut?.key) {
            stored.push({ key: studioVideo.cut.key, name: studioVideo.cut.name, mimeType: files[0].mimeType, bytes: studioVideo.cut.bytes });
        } else if (cutStorage.storage()) {
            for (const f of files) {
                const ext = VIDEO_TYPES[f.mimeType] || IMAGE_TYPES[f.mimeType];
                const key = `estimates/${id}/${crypto.randomBytes(8).toString("hex")}${ext}`;
                await cutStorage.putFile(key, f.path, f.mimeType, f.bytes);
                stored.push({ key, name: f.name.slice(0, 120), mimeType: f.mimeType, bytes: f.bytes });
            }
        }
        if (stored.length) await CreativeEstimate.updateOne({ _id: id }, { $set: { files: stored } });

        const result = await review.reviewCreative({ format, files, adText, buyerLabel: buyerLabel(buyerType) });
        await CreativeEstimate.updateOne({ _id: id }, { $set: { review: result, reviewState: "done", reviewError: null } });
    } catch (e) {
        await CreativeEstimate.updateOne({ _id: id }, { $set: { reviewState: "failed", reviewError: String(e.message).slice(0, 300) } });
        throw e;
    } finally {
        for (const f of files) fs.promises.unlink(f.path).catch(() => {});
    }
}

/** A Studio video's cut, saved to a temp file so it can be checked like an upload. */
async function studioVideoFile(video) {
    if (!video?.cut?.key) throw new InputError("That video has no finished cut yet.");
    const ext = path.extname(video.cut.name).toLowerCase();
    const mimeType = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[ext];
    if (!mimeType) throw new InputError("That video's cut is not a video or image file.");
    const tmp = path.join(os.tmpdir(), `estimate-${crypto.randomBytes(8).toString("hex")}${ext}`);
    await cutStorage.downloadTo(video.cut.key, tmp);
    return { path: tmp, name: video.cut.name, mimeType, bytes: video.cut.bytes };
}

// ---------------------------------------------------------------------------
// Guess vs real
// ---------------------------------------------------------------------------

/**
 * What the linked ad really got, next to what we would have guessed at its real spend. The
 * guess scales with spend, so a $50/day plan is still comparable with an ad that spent $80.
 */
function guessVsReal(record, row) {
    if (!row) return null;
    const plan = record.estimate?.plan;
    const n = record.estimate?.numbers;
    if (!plan?.spend || !n) return null;
    const scale = row.spend / plan.spend;
    const out = { spend: Math.round(row.spend * 100) / 100, impressions: {}, clicks: {}, leads: {} };
    for (const k of ["impressions", "clicks", "leads"]) {
        const low = Math.round(n[k].low * scale);
        const high = Math.round(n[k].high * scale);
        out[k] = { guess: Math.round(n[k].expected * scale), low, high, real: row[k], inRange: row[k] >= low && row[k] <= high };
    }
    return out;
}

/** An estimate as the page gets it. File keys never leave the server. */
async function view(record, rowsById = null) {
    const stale = record.reviewState === "pending" && Date.now() - new Date(record.createdAt).getTime() > REVIEW_STALE_MS;
    const files = await Promise.all(
        (record.files || []).map(async (f) => ({ name: f.name, mimeType: f.mimeType, bytes: f.bytes, url: await cutStorage.viewUrl(f.key) }))
    );
    const linked = record.linkedAd?.adId ? record.linkedAd : null;
    return {
        _id: record._id,
        byName: record.byName,
        title: record.title,
        format: record.format,
        leadPlace: record.leadPlace,
        buyerType: record.buyerType,
        buyerLabel: buyerLabel(record.buyerType),
        dailyBudget: record.dailyBudget,
        days: record.days,
        adText: record.adText,
        studioCoreId: record.studioCoreId,
        estimate: record.estimate,
        reviewState: stale ? "failed" : record.reviewState,
        review: record.review,
        reviewError: stale ? "The check did not finish. Try again." : record.reviewError,
        files,
        linkedAd: linked,
        result: linked && rowsById ? guessVsReal(record, rowsById.get(linked.adId)) : null,
        createdAt: record.createdAt,
    };
}

const visibleTo = (user) => (user.role === "admin" ? {} : { createdBy: user._id });

/** The estimates this person may see, newest first, with guess vs real where linked. */
async function listEstimates(user, { limit = 50 } = {}) {
    const records = await CreativeEstimate.find(visibleTo(user)).sort({ createdAt: -1 }).limit(limit).lean();
    let rowsById = null;
    if (records.some((r) => r.linkedAd?.adId)) {
        try {
            rowsById = new Map((await loadHistory()).rows.map((r) => [r.adId, r]));
        } catch (e) {
            console.error(`[creative-estimate] could not load past ads for results: ${e.message}`);
        }
    }
    return Promise.all(records.map((r) => view(r, rowsById)));
}

async function getEstimate(user, id) {
    const record = await CreativeEstimate.findOne({ _id: id, ...visibleTo(user) }).lean();
    if (!record) return null;
    let rowsById = null;
    if (record.linkedAd?.adId) rowsById = new Map((await loadHistory()).rows.map((r) => [r.adId, r]));
    return view(record, rowsById);
}

/** Recent Meta ads someone can link an estimate to, newest first. */
async function linkableAds() {
    const h = await loadHistory();
    const since = Date.now() - LINKABLE_DAYS * 86400000;
    return h.rows
        .filter((r) => r.adId && r.createdAt && Date.parse(r.createdAt) >= since)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((r) => ({ adId: r.adId, name: r.name, campaignName: r.campaignName, createdAt: r.createdAt, format: r.format, thumbnailUrl: r.thumbnailUrl, spend: r.spend }));
}

async function linkEstimate(user, byName, id, adId) {
    const record = await CreativeEstimate.findOne({ _id: id, ...visibleTo(user) });
    if (!record) return null;
    if (adId == null || adId === "") {
        record.linkedAd = { adId: null, name: null, byName: null, at: null };
    } else {
        const ad = (await loadHistory()).rows.find((r) => r.adId === String(adId));
        if (!ad) throw new InputError("That Meta ad was not found. New ads show up within a few hours.");
        record.linkedAd = { adId: ad.adId, name: ad.name, byName, at: new Date() };
    }
    await record.save();
    return getEstimate(user, id);
}

/** For the page's "how good is this tool" box. */
async function accuracy() {
    const h = await loadHistory();
    return {
        backtest: h.test.summary,
        usableAds: h.rows.filter(model.usable).length,
        totalAds: h.rows.length,
        taggedAds: h.rows.filter((r) => r.buyerType).length,
        loadedAt: new Date(h.at).toISOString(),
    };
}

module.exports = {
    loadHistory,
    createEstimate,
    studioVideoFile,
    listEstimates,
    getEstimate,
    linkableAds,
    linkEstimate,
    accuracy,
    cleanInput,
    formatOfFiles,
    guessVsReal,
    InputError,
    VIDEO_TYPES,
    IMAGE_TYPES,
    MAX_CAROUSEL,
    REVIEW_STALE_MS,
};
