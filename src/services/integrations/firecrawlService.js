// services/integrations/firecrawlService.js
//
// Thin client for the Firecrawl v2 scrape API. Holds the two request formats
// used by the Property Importer:
//   - DETAILS: markdown of the Zillow listing (facts, schools, history, ...)
//   - IMAGES : raw HTML of the listing (the photo gallery lives in __NEXT_DATA__)
//
// Env: FIRECRAWL_API_KEY (required)

const Errorhandler = require("../../utils/errorhandler");

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

// Stealth proxy + waitFor make a scrape slow; keep a generous ceiling so a
// hung request can't hold the admin's HTTP request open forever.
const REQUEST_TIMEOUT_MS = 120000;

const DETAILS_SCRAPE_OPTIONS = Object.freeze({
    proxy: "stealth",
    onlyMainContent: true,
    removeBase64Images: true,
    excludeTags: ["script", "style", "nav", "svg", "noscript", "iframe"],
    waitFor: 7000,
    formats: ["markdown"],
});

const IMAGES_SCRAPE_OPTIONS = Object.freeze({
    proxy: "stealth",
    waitFor: 5000,
    removeBase64Images: true,
    formats: ["rawHtml"],
});

function isConfigured() {
    return Boolean(process.env.FIRECRAWL_API_KEY);
}

/**
 * POST one scrape request to Firecrawl.
 * @param {string} url      Page to scrape.
 * @param {object} options  Firecrawl scrape options (everything except url).
 * @returns {Promise<object>} Firecrawl JSON body: { success, data: { markdown | rawHtml, metadata } }
 */
async function scrape(url, options) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
        throw new Errorhandler("Firecrawl is not configured on the server (FIRECRAWL_API_KEY missing)", 500);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(FIRECRAWL_SCRAPE_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ url, ...options }),
            signal: controller.signal,
        });

        let body = null;
        try {
            body = await response.json();
        } catch {
            body = null;
        }

        if (!response.ok || !body || body.success === false) {
            const reason = body?.error || body?.message || `HTTP ${response.status}`;
            throw new Errorhandler(`Firecrawl scrape failed: ${reason}`, 502);
        }

        return body;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Errorhandler(`Firecrawl scrape timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, 504);
        }
        if (error instanceof Errorhandler) throw error;
        throw new Errorhandler(`Firecrawl request error: ${error.message}`, 502);
    } finally {
        clearTimeout(timer);
    }
}

/** Markdown scrape — input for zillowDetailsParser. */
const scrapePropertyDetails = (url) => scrape(url, DETAILS_SCRAPE_OPTIONS);

/** Raw HTML scrape — input for zillowImageParser. */
const scrapePropertyImages = (url) => scrape(url, IMAGES_SCRAPE_OPTIONS);

module.exports = {
    isConfigured,
    scrapePropertyDetails,
    scrapePropertyImages,
};
