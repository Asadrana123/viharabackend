// services/marketing/htmlRenderer.js
//
// Renders an HTML document to a PNG with headless Chrome (Puppeteer).
//
// One Chrome is shared by every render and closed after a short idle period,
// so an ad set's images reuse the same browser and the server doesn't keep
// Chrome in memory when nothing is being rendered. Each render uses its own
// page, which is always closed, even on errors.
//
// Network allowlist: a page may only load inline data, Google Fonts, this
// account's Cloudinary images and the exact image URLs passed in. Anything
// else (another site, a local/internal address) is blocked.

const { CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");

const settings = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.HYBRID];

const FONT_HOSTS = Object.freeze(["fonts.googleapis.com", "fonts.gstatic.com"]);

function isAllowedRequest(url, allowedUrls) {
    if (url.startsWith("data:") || url === "about:blank") return true;
    if (allowedUrls.has(url)) return true;

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== "https:") return false;
    if (FONT_HOSTS.includes(parsed.hostname)) return true;

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    return Boolean(cloud) && parsed.hostname === "res.cloudinary.com" && parsed.pathname.startsWith(`/${cloud}/`);
}

let browserPromise = null;
let openPages = 0;
let idleTimer = null;

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------
async function launchBrowser() {
    if (settings.browser === "sparticuz") {
        // Linux servers (Render): bundled Chromium, no system Chrome needed.
        const chromium = require("@sparticuz/chromium");
        const puppeteer = require("puppeteer-core");
        return puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: "shell",
        });
    }

    // Local development: full puppeteer with its own Chrome.
    const puppeteer = require("puppeteer");
    return puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
}

function getBrowser() {
    clearTimeout(idleTimer);
    if (!browserPromise) {
        browserPromise = launchBrowser()
            .then((browser) => {
                browser.on("disconnected", () => { browserPromise = null; });
                return browser;
            })
            .catch((error) => {
                browserPromise = null;
                throw new Error(`Could not start the browser for rendering: ${error?.message || error}`);
            });
    }
    return browserPromise;
}

function scheduleIdleClose() {
    clearTimeout(idleTimer);
    if (openPages > 0) return;
    idleTimer = setTimeout(async () => {
        const pending = browserPromise;
        browserPromise = null;
        if (!pending) return;
        try {
            const browser = await pending;
            await browser.close();
        } catch {
            // already closed
        }
    }, settings.browserIdleCloseMs);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
/**
 * @param {string} html
 * @param {{ width: number, height: number }} size  final pixels
 * @param {object} [options]
 * @param {string[]} [options.allowedUrls]  extra exact URLs the page may load
 * @returns {Promise<Buffer>} PNG
 */
async function renderHtmlToPng(html, { width, height }, { allowedUrls = [] } = {}) {
    const browser = await getBrowser();
    openPages += 1;
    let page = null;

    try {
        page = await browser.newPage();

        const allowed = new Set(allowedUrls);
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            if (request.isInterceptResolutionHandled()) return;
            if (isAllowedRequest(request.url(), allowed)) request.continue();
            else request.abort("blockedbyclient");
        });

        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "networkidle0", timeout: settings.renderTimeoutMs });

        // Wait for Inter, then shrink text that doesn't fit.
        await page.evaluate(async () => {
            await document.fonts.ready;
            if (typeof window.__fit === "function") window.__fit();
        });

        const image = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
        return Buffer.from(image);
    } finally {
        if (page) await page.close().catch(() => {});
        openPages -= 1;
        scheduleIdleClose();
    }
}

module.exports = { renderHtmlToPng };
