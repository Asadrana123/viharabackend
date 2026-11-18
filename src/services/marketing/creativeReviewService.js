// services/marketing/creativeReviewService.js
//
// The AI parts of the Studio's Estimate page, both with Gemini:
//   - tagPastAds: reads our past Meta ads' own words (campaign, ad set, text) and says which
//     buyer each spoke to and which US state its property is in. Run once per ad; kept in
//     CreativeAdTag.
//   - reviewCreative: watches a new video (or looks at a static / carousel) and checks it against
//     a fixed list (hook in the first 3 seconds, works with sound off, price shown...). Advice
//     only: the numbers on the page never come from here.
//
// Env: GEMINI_API_KEY, GEMINI_MODEL (services/geminiModel.js).

const fs = require("fs");
const { GEMINI_MODEL } = require("../geminiModel");
const { recordGemini } = require("../usage/spendRecorder");
const { BUYER_TYPES } = require("../studio/runService");

const TAG_BATCH = 25;
const FILE_WAIT_MS = 3 * 60 * 1000;
const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

let _client = null;
function client() {
    if (_client) return _client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const { GoogleGenAI } = require("@google/genai");
    _client = new GoogleGenAI({ apiKey });
    return _client;
}

const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

function parseJson(text) {
    const clean = String(text || "").replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
}

// ---------------------------------------------------------------------------
// Tagging past ads
// ---------------------------------------------------------------------------

const BUYER_IDS = BUYER_TYPES.map((b) => b.id);

/** What the AI sees of one past ad: only its own words. */
function adWords(ad) {
    const c = ad.creative || {};
    return {
        adId: String(ad.platformAdId),
        campaign: ad.campaignName || "",
        adSet: ad.adSetName || "",
        adName: ad.name || "",
        headline: c.headline || (c.headlines || [])[0] || "",
        text: String(c.body || (c.bodies || [])[0] || "").slice(0, 600),
        link: c.linkUrl || "",
    };
}

function tagPrompt(batch) {
    return [
        "You tag past Facebook/Instagram ads for Vihara, a US real-estate deals marketplace (bank-owned homes, auctions, financing).",
        "For each ad, using only its own words, say:",
        `- buyerType: who the ad speaks to, one of: ${BUYER_TYPES.map((b) => `"${b.id}" (${b.label})`).join(", ")}; or null when it is not clear.`,
        "  Hints: fix-and-flip / rehab / ARV -> fix_and_flip; rental / DSCR / cash flow / buy and hold -> buy_and_hold; 'your first investment' -> first_time_investor;",
        "  portfolio / bulk / many deals -> serial_investor; funds / institutions -> institutional_buyer; land / build -> developer_construction;",
        "  'your home', families, owner-occupant, first home -> homeowner; agents / realtors / commission -> realtor.",
        "- state: the two-letter US state of the property or audience (e.g. TX), or null when not clear.",
        "Answer with a JSON array only: [{\"adId\": \"...\", \"buyerType\": \"...\" | null, \"state\": \"..\" | null}], one item per ad, same adIds.",
        "",
        JSON.stringify(batch),
    ].join("\n");
}

/** Keeps only answers in our lists. */
function cleanTag(t) {
    const buyerType = BUYER_IDS.includes(t?.buyerType) ? t.buyerType : null;
    const state = typeof t?.state === "string" && US_STATES.has(t.state.toUpperCase()) ? t.state.toUpperCase() : null;
    return { adId: String(t?.adId ?? ""), buyerType, state };
}

/**
 * Tags past Zernio ads in batches.
 * @returns {Promise<Array<{ adId, buyerType, state }>>} only the ads the AI answered for
 */
async function tagPastAds(ads) {
    const ai = client();
    if (!ai || !ads.length) return [];
    const out = [];
    for (let i = 0; i < ads.length; i += TAG_BATCH) {
        const batch = ads.slice(i, i + TAG_BATCH).map(adWords);
        const wanted = new Set(batch.map((b) => b.adId));
        try {
            const result = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: [{ role: "user", parts: [{ text: tagPrompt(batch) }] }],
                config: { temperature: 0, responseMimeType: "application/json" },
            });
            recordGemini("creative-estimate-tags", GEMINI_MODEL, result, { what: `${batch.length} past ads` });
            const parsed = parseJson(result.text);
            for (const t of Array.isArray(parsed) ? parsed : []) {
                const tag = cleanTag(t);
                if (wanted.has(tag.adId)) out.push(tag);
            }
        } catch (e) {
            console.error(`[creative-estimate] tagging batch ${i / TAG_BATCH + 1} failed: ${e.message}`);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Checking a new creative
// ---------------------------------------------------------------------------

// The fixed list, per format. The page shows them in this order.
const CHECKS = {
    video: [
        { id: "hook_fast", label: "Hook in the first 3 seconds", ask: "Is there a strong reason to keep watching (a number, a surprise, a question, a striking shot) within the first 3 seconds? Give the second it lands." },
        { id: "sound_off", label: "Works with the sound off", ask: "Can someone with the sound off follow it (captions or text on screen)?" },
        { id: "price_shown", label: "Price or deal number on screen", ask: "Is a price, discount or deal number shown on screen?" },
        { id: "place_shown", label: "City or place shown", ask: "Is the city, state or place shown or said?" },
        { id: "cta_clear", label: "Clear next step", ask: "Does it end with one clear next step (e.g. see the deal, answer a few questions)?" },
        { id: "length_ok", label: "Length fits a feed ad", ask: "Is it 60 seconds or shorter? Under 30 is best for cold audiences." },
    ],
    image: [
        { id: "one_message", label: "One clear message", ask: "Does the image say one thing clearly, without clutter?" },
        { id: "text_readable", label: "Text readable on a phone", ask: "Is all text big and clear enough to read on a phone screen?" },
        { id: "price_shown", label: "Price or deal number shown", ask: "Is a price, discount or deal number shown?" },
        { id: "place_shown", label: "City or place shown", ask: "Is the city, state or place shown?" },
        { id: "cta_clear", label: "Clear next step", ask: "Is there one clear next step?" },
    ],
    carousel: [
        { id: "first_card_hook", label: "First card makes you swipe", ask: "Does the first card give a strong reason to swipe?" },
        { id: "cards_follow", label: "Cards tell one story in order", ask: "Do the cards follow on from each other in a clear order?" },
        { id: "text_readable", label: "Text readable on a phone", ask: "Is all text big and clear enough to read on a phone screen?" },
        { id: "price_shown", label: "Price or deal number shown", ask: "Is a price, discount or deal number shown on some card?" },
        { id: "cta_clear", label: "Clear next step", ask: "Does the last card (or the set) end with one clear next step?" },
    ],
};

function reviewPrompt(format, { adText, buyerLabel }) {
    const checks = CHECKS[format];
    return [
        `You check a ${format === "carousel" ? "carousel (the images are the cards, in order)" : format} ad for Vihara, a US real-estate deals marketplace, before it goes live on Facebook and Instagram.`,
        buyerLabel ? `It is meant for: ${buyerLabel}.` : "",
        adText ? `The ad text that will go with it:\n"""${adText.slice(0, 1500)}"""` : "",
        "Answer each check with status \"good\", \"fix\" or \"unsure\" and a short note a video editor can act on (plain words, under 25 words).",
        ...checks.map((c) => `- ${c.id}: ${c.ask}`),
        "Also give: summary (2 short sentences: the biggest strength and the one change most likely to help),",
        format === "video" ? "hookSecond (the second the hook lands, a number, or null) and lengthSeconds (the video's length, a number)." : "",
        `Answer with JSON only: {"summary": "...", "checks": [{"id": "...", "status": "...", "note": "..."}]${format === "video" ? ', "hookSecond": n, "lengthSeconds": n' : ""}}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function cleanReview(format, raw) {
    const byId = new Map((Array.isArray(raw?.checks) ? raw.checks : []).map((c) => [String(c?.id), c]));
    const checks = CHECKS[format].map(({ id, label }) => {
        const c = byId.get(id);
        const status = ["good", "fix", "unsure"].includes(c?.status) ? c.status : "unsure";
        return { id, label, status, note: String(c?.note ?? "").slice(0, 300) };
    });
    const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v) * 10) / 10 : null);
    return {
        summary: String(raw?.summary ?? "").slice(0, 600),
        checks,
        hookSecond: format === "video" ? num(raw?.hookSecond) : null,
        lengthSeconds: format === "video" ? num(raw?.lengthSeconds) : null,
        model: GEMINI_MODEL,
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Uploads a video to Gemini's file store and waits until it can be read. */
async function uploadVideo(ai, path, mimeType) {
    let file = await ai.files.upload({ file: path, config: { mimeType } });
    const started = Date.now();
    while (file.state === "PROCESSING") {
        if (Date.now() - started > FILE_WAIT_MS) throw new Error("Gemini took too long to read the video.");
        await sleep(3000);
        file = await ai.files.get({ name: file.name });
    }
    if (file.state === "FAILED") throw new Error("Gemini could not read the video.");
    return file;
}

/**
 * Checks a new creative against the fixed list.
 * @param {{ format: "video"|"image"|"carousel", files: Array<{ path, mimeType }>, adText?, buyerLabel? }} input
 * @returns {Promise<object>} cleanReview() shape
 */
async function reviewCreative({ format, files, adText = "", buyerLabel = "" }) {
    const ai = client();
    if (!ai) throw new Error("Gemini is not set up on this server (GEMINI_API_KEY).");
    if (!CHECKS[format]) throw new Error(`Unknown format: ${format}`);
    const { createPartFromUri } = require("@google/genai");

    const parts = [];
    const uploaded = [];
    try {
        for (const f of files) {
            if (f.mimeType.startsWith("video/")) {
                const file = await uploadVideo(ai, f.path, f.mimeType);
                uploaded.push(file.name);
                parts.push(createPartFromUri(file.uri, file.mimeType));
            } else {
                parts.push({ inlineData: { mimeType: f.mimeType, data: fs.readFileSync(f.path).toString("base64") } });
            }
        }
        parts.push({ text: reviewPrompt(format, { adText, buyerLabel }) });
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts }],
            config: { temperature: 0.2, responseMimeType: "application/json" },
        });
        recordGemini("creative-estimate-review", GEMINI_MODEL, result, { what: format });
        return cleanReview(format, parseJson(result.text));
    } finally {
        // Gemini keeps uploads for 48 hours; ours are not needed after the answer.
        for (const name of uploaded) ai.files.delete({ name }).catch(() => {});
    }
}

module.exports = { geminiConfigured, tagPastAds, reviewCreative, cleanTag, cleanReview, reviewPrompt, adWords, CHECKS };
