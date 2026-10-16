// services/conversion/pageSpeed.js
//
// Google PageSpeed Insights: Google's servers load the page in Chrome (phone
// or desktop) and report speed, console errors, and a screenshot of the first
// screen. Used instead of our own browser on Render, where Chrome needs more
// memory than the server has. Also returns real-visitor speed (Chrome UX
// Report) when Google has enough visits for the page.
//
// Env: PAGESPEED_API_KEY (falls back to GEMINI_API_KEY; the PageSpeed Insights
// API must be enabled in that key's Google Cloud project).

const axios = require("axios");

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const AUDITS = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "speed-index",
    "interactive",
    "total-blocking-time",
    "cumulative-layout-shift",
    "server-response-time",
    "redirects",
    "total-byte-weight",
    "render-blocking-resources",
    "uses-optimized-images",
    "offscreen-images",
    "unused-javascript",
];

const apiKey = () => process.env.PAGESPEED_API_KEY || process.env.GEMINI_API_KEY || "";

const toBuffer = (dataUri) => (dataUri ? Buffer.from(String(dataUri).replace(/^data:image\/\w+;base64,/, ""), "base64") : null);

/**
 * @param {string} url
 * @param {"mobile"|"desktop"} strategy
 * @returns {Promise<{out: object, firstScreen: Buffer|null, fullPage: Buffer|null}>}
 */
async function runPageSpeed(url, strategy = "mobile") {
    const key = apiKey();
    if (!key) throw new Error("PageSpeed isn't set up (PAGESPEED_API_KEY missing).");
    let data;
    try {
        ({ data } = await axios.get(ENDPOINT, { params: { url, strategy, category: "performance", key }, timeout: 120000 }));
    } catch (error) {
        const message = error.response?.data?.error?.message || error.message;
        throw new Error(`PageSpeed failed: ${String(message).split(". ")[0]}`);
    }
    const lh = data.lighthouseResult || {};
    const audits = lh.audits || {};
    const metrics = {};
    for (const id of AUDITS) {
        const a = audits[id];
        if (a) metrics[id] = a.displayValue || (a.score === 1 ? "ok" : a.score === null ? "n/a" : `score ${a.score}`);
    }
    const consoleErrors = (audits["errors-in-console"]?.details?.items || []).slice(0, 8).map((i) => `${i.source || ""}: ${String(i.description || "").slice(0, 200)}`);
    // Real visitors' speed for this page (or the whole site when the page has too few visits).
    const field = data.loadingExperience?.metrics ? data.loadingExperience : data.originLoadingExperience;
    const realVisitors = field?.metrics
        ? {
              scope: field === data.loadingExperience ? "this page" : "whole site",
              overall: field.overall_category,
              ...Object.fromEntries(Object.entries(field.metrics).map(([k, v]) => [k.toLowerCase(), `${v.percentile} (${v.category})`])),
          }
        : "not enough real-visitor data";

    return {
        out: {
            url: lh.finalDisplayedUrl || url,
            device: strategy,
            performanceScore: lh.categories?.performance?.score != null ? Math.round(lh.categories.performance.score * 100) : null,
            lab: metrics,
            consoleErrors: consoleErrors.length ? consoleErrors : "none",
            realVisitors,
            note: "Google loads the page on a simulated mid-range phone with a slow 4G connection (mobile).",
        },
        firstScreen: toBuffer(audits["final-screenshot"]?.details?.data),
        fullPage: toBuffer(audits["full-page-screenshot"]?.details?.screenshot?.data),
    };
}

module.exports = { runPageSpeed };
