// services/conversion/visitorBrowser.js
//
// A real Chrome the sign-up doctor uses to see a landing page the way an ad
// visitor does: on a phone or a desktop, optionally on a slow connection. It
// reports load speed, errors, the tracking events the page fires, and the
// form (fields, buttons, what is on screen without scrolling), with a
// screenshot after every step.
//
// Nothing can leave the browser that would have an effect:
//   - every write (POST/PUT/PATCH/DELETE) to any server is blocked and recorded,
//     so submitting the form shows what WOULD be sent but never saves a lead;
//   - tracking hits (Meta pixel, Clarity, Google) are blocked and recorded, so
//     our visits never count as page views or registrations.
// Reads (the page, its scripts, property data) load normally.

const settings = { browser: process.env.MARKETING_BROWSER || (process.platform === "linux" ? "sparticuz" : "puppeteer") };

const NAV_TIMEOUT_MS = 45000;
const ACTION_TIMEOUT_MS = 8000;
const MAX_EVENTS = 40;
const MAX_TEXT_CHARS = 3500;
const MAX_FULL_HEIGHT = 6000;

const DEVICES = {
    mobile: {
        viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    },
    desktop: {
        viewport: { width: 1366, height: 800, deviceScaleFactor: 1 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
    },
};
// Download / upload bytes per second and latency, like Chrome DevTools' presets.
const NETWORKS = {
    normal: null,
    slow4g: { download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, latency: 150 },
    "3g": { download: (500 * 1024) / 8, upload: (500 * 1024) / 8, latency: 400 },
};

// Tracking hits: recorded and blocked. Their scripts still load so the page behaves normally.
const BEACONS = [
    { name: "Meta pixel", test: (u) => /(^|\.)facebook\.com$/.test(u.hostname) && u.pathname.startsWith("/tr"), event: (u) => u.searchParams.get("ev") },
    { name: "Clarity", test: (u) => /(^|\.)clarity\.ms$/.test(u.hostname) && /collect/.test(u.pathname), event: () => "session data" },
    { name: "Google", test: (u) => /(google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|(^|\.)google\.com)$/.test(u.hostname) && /collect|conversion|pagead/.test(u.pathname), event: (u) => u.searchParams.get("en") || u.searchParams.get("t") || "hit" },
];

/** Meta's Conversions API Gateway (server-side pixel copy): its event name, else null. */
function capiGatewayEvent(body) {
    try {
        const json = JSON.parse(body);
        return json && json["fb.pixel_id"] ? String(json.event_name || "event") : null;
    } catch {
        return null;
    }
}

async function launch() {
    if (settings.browser === "sparticuz") {
        const chromium = require("@sparticuz/chromium");
        const puppeteer = require("puppeteer-core");
        return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
    }
    const puppeteer = require("puppeteer");
    return puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
}

/** Field names in a request body (never the values). */
function bodyFields(text) {
    if (!text) return [];
    try {
        const json = JSON.parse(text);
        return json && typeof json === "object" ? Object.keys(json) : [];
    } catch {
        try {
            return [...new URLSearchParams(text).keys()];
        } catch {
            return [];
        }
    }
}

/** What a visitor sees and can use, read from the page itself. Runs in the browser. */
function readPage(maxText) {
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    const labelOf = (el) => {
        const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        return (
            el.getAttribute("aria-label") ||
            byFor?.innerText ||
            el.closest("label")?.innerText ||
            el.getAttribute("placeholder") ||
            el.getAttribute("name") ||
            el.innerText ||
            el.value ||
            ""
        ).trim().replace(/\s+/g, " ").slice(0, 80);
    };
    const where = (el) => {
        const r = el.getBoundingClientRect();
        const top = Math.round(r.top + window.scrollY);
        return { top, onFirstScreen: top + r.height / 2 < window.innerHeight };
    };
    const fields = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(visible).map((el) => ({
        kind: el.tagName === "INPUT" ? el.type : el.tagName.toLowerCase(),
        label: labelOf(el),
        required: el.required || el.getAttribute("aria-required") === "true",
        filled: el.type === "checkbox" || el.type === "radio" ? el.checked : Boolean(el.value),
        invalid: el.matches(":invalid") && Boolean(el.value || el.checked),
        ...where(el),
    }));
    const buttons = [...document.querySelectorAll("button, [type=submit], a[role=button], a.btn, a[class*=button]")].filter(visible).map((el) => ({
        text: labelOf(el),
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
        ...where(el),
    }));
    const messages = [...document.querySelectorAll("[role=alert], [class*=error], [class*=Error], [aria-live]")]
        .filter(visible)
        .map((el) => el.innerText.trim())
        .filter(Boolean)
        .slice(0, 10);
    const headings = [...document.querySelectorAll("h1, h2, h3")].filter(visible).map((h) => `${h.tagName}: ${h.innerText.trim().slice(0, 120)}`).slice(0, 15);
    // Things covering the screen: cookie bars, chat widgets, pop-ups.
    const overlays = [...document.querySelectorAll("body *")]
        .filter((el) => {
            const s = getComputedStyle(el);
            if (s.position !== "fixed" && s.position !== "sticky") return false;
            const r = el.getBoundingClientRect();
            return visible(el) && r.width * r.height > window.innerWidth * window.innerHeight * 0.12;
        })
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} covering ${Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100)}% of the screen height: "${el.innerText.trim().slice(0, 80)}"`)
        .slice(0, 5);
    return {
        title: document.title,
        pageHeight: document.documentElement.scrollHeight,
        screenHeight: window.innerHeight,
        scrolledTo: Math.round(window.scrollY),
        headings,
        fields,
        buttons: buttons.slice(0, 25),
        messages,
        overlays,
        text: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, maxText),
    };
}

/** Puppeteer selector for the agent's description of an element. */
function selectorFor(target = {}) {
    const q = (s) => String(s).replace(/[()]/g, "");
    if (target.css) return target.css;
    if (target.placeholder) return `[placeholder*="${String(target.placeholder).replace(/"/g, '\\"')}"]`;
    if (target.label) return `::-p-aria(${q(target.label)})`;
    if (target.text) return `::-p-text(${q(target.text)})`;
    throw new Error("target needs one of: text, label, placeholder, css");
}

function createVisitor({ log = () => {} } = {}) {
    let browser = null;
    let page = null;
    let device = null;
    let events = [];
    const tracking = []; // every tracking hit seen this session
    const shots = []; // { id, caption, buffer }

    const note = (text) => {
        if (events[events.length - 1] !== text) events.push(text);
        if (events.length > MAX_EVENTS * 2) events = events.slice(-MAX_EVENTS);
    };

    async function newPage(kind, network) {
        if (!browser) browser = await launch();
        if (page) await page.close().catch(() => {});
        page = await browser.newPage();
        device = kind;
        await page.setViewport(DEVICES[kind].viewport);
        await page.setUserAgent(DEVICES[kind].userAgent);
        page.setDefaultTimeout(ACTION_TIMEOUT_MS);
        page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
        if (NETWORKS[network]) await page.emulateNetworkConditions(NETWORKS[network]);
        await page.setRequestInterception(true);

        page.on("request", (req) => {
            if (req.isInterceptResolutionHandled()) return;
            let u;
            try {
                u = new URL(req.url());
            } catch {
                return req.continue().catch(() => {});
            }
            if (u.protocol === "data:" || u.protocol === "blob:") return req.continue().catch(() => {});
            const beacon = BEACONS.find((b) => b.test(u));
            if (beacon) {
                const hit = `${beacon.name}: ${beacon.event(u) || "hit"}`;
                tracking.push(hit);
                note(`tracking fired (blocked) → ${hit}`);
                return req.abort("blockedbyclient").catch(() => {});
            }
            const method = req.method();
            if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
                const gatewayEvent = capiGatewayEvent(req.postData());
                if (gatewayEvent) {
                    tracking.push(`Meta CAPI gateway: ${gatewayEvent}`);
                    note(`tracking fired (blocked) → Meta CAPI gateway: ${gatewayEvent}`);
                    return req.abort("blockedbyclient").catch(() => {});
                }
                const fields = bodyFields(req.postData());
                note(`blocked ${method} ${u.hostname}${u.pathname}${fields.length ? ` with fields [${fields.join(", ")}]` : ""} (writes are never sent)`);
                return req.abort("blockedbyclient").catch(() => {});
            }
            return req.continue().catch(() => {});
        });
        page.on("console", (msg) => {
            if (msg.type() === "error" && !/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/.test(msg.text())) note(`console error: ${msg.text().slice(0, 300)}`);
        });
        page.on("pageerror", (err) => note(`page crashed: ${String(err.message || err).split("\n")[0].slice(0, 300)}`));
        page.on("requestfailed", (req) => {
            const reason = req.failure()?.errorText || "";
            if (!/BLOCKED_BY_CLIENT|ERR_ABORTED/.test(reason)) note(`failed to load ${req.url().slice(0, 160)} (${reason})`);
        });
        page.on("response", (res) => {
            if (res.status() >= 400 && res.request().resourceType() !== "image") note(`${res.status()} from ${res.url().slice(0, 160)}`);
        });
        page.on("dialog", (d) => {
            note(`${d.type()} dialog: "${d.message().slice(0, 200)}"`);
            d.dismiss().catch(() => {});
        });
        page.on("popup", (p) => {
            note(`page opened a new tab: ${p.url()}`);
            p.close().catch(() => {});
        });
    }

    async function snapshot({ full = false, caption } = {}) {
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});
        const state = await page.evaluate(readPage, MAX_TEXT_CHARS).catch((e) => ({ error: `could not read the page: ${e.message}` }));
        const height = Math.min(state.pageHeight || 0, MAX_FULL_HEIGHT);
        const buffer = await page.screenshot({
            type: "jpeg",
            quality: 60,
            ...(full && height ? { clip: { x: 0, y: 0, width: DEVICES[device].viewport.width, height } } : {}),
            ...(full && height ? { captureBeyondViewport: true } : {}),
        });
        const id = `s${shots.length + 1}`;
        shots.push({ id, caption: caption || `${device}: ${page.url()}`, buffer });
        const out = { url: page.url(), device, screenshotId: id, ...state };
        if (events.length) out.events = events.splice(0).slice(-MAX_EVENTS);
        return { out, image: buffer.toString("base64") };
    }

    /** Load a page as a visitor: status, timings, then what is on the first screen. */
    async function open({ url, device: kind = "mobile", network = "normal" }) {
        if (!DEVICES[kind]) throw new Error('device must be "mobile" or "desktop"');
        if (!(network in NETWORKS)) throw new Error(`network must be one of: ${Object.keys(NETWORKS).join(", ")}`);
        log(`browser open ${url} (${kind}, ${network})`);
        await newPage(kind, network);
        const started = Date.now();
        let status = 0;
        try {
            const res = await page.goto(url, { waitUntil: "domcontentloaded" });
            status = res?.status() || 0;
        } catch (err) {
            note(`page did not finish loading: ${err.message.split("\n")[0]}`);
        }
        // How long until a visitor can start typing into the form.
        let firstFieldMs = null;
        try {
            await page.waitForSelector("form input:not([type=hidden]), input[type=email], input[type=tel]", { visible: true, timeout: 20000 });
            firstFieldMs = Date.now() - started;
        } catch {
            note("no form field became visible within 20 seconds of opening the page");
        }
        const timing = await page
            .evaluate(
                () =>
                    new Promise((resolve) => {
                        const nav = performance.getEntriesByType("navigation")[0] || {};
                        let lcp = null;
                        try {
                            new PerformanceObserver((list) => {
                                const e = list.getEntries().pop();
                                if (e) lcp = Math.round(e.startTime);
                            }).observe({ type: "largest-contentful-paint", buffered: true });
                        } catch {}
                        setTimeout(() => {
                            const bytes = performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), 0) + (nav.transferSize || 0);
                            resolve({
                                domReadyMs: Math.round(nav.domContentLoadedEventEnd || 0),
                                loadMs: Math.round(nav.loadEventEnd || 0),
                                largestPaintMs: lcp,
                                downloadedKb: Math.round(bytes / 1024),
                                requests: performance.getEntriesByType("resource").length,
                            });
                        }, 300);
                    })
            )
            .catch(() => ({}));
        const { out, image } = await snapshot({ caption: `${kind}${network !== "normal" ? ` (${network})` : ""}: first screen of ${url}` });
        return { out: { status, finalUrl: page.url(), timing: { ...timing, firstFormFieldVisibleMs: firstFieldMs }, ...out }, image };
    }

    /** One visitor action on the open page. */
    async function act({ action, target, value, full }) {
        if (!page) throw new Error("open a page first");
        log(`browser ${action}${target ? ` ${JSON.stringify(target).slice(0, 100)}` : ""}`);
        try {
            switch (action) {
                case "click":
                    await page.locator(selectorFor(target)).click();
                    break;
                case "fill":
                    await page.locator(selectorFor(target)).fill(String(value ?? ""));
                    break;
                case "select":
                    await page.locator(selectorFor(target)).fill(String(value ?? ""));
                    break;
                case "press":
                    await page.keyboard.press(String(value || "Enter"));
                    break;
                case "scroll":
                    if (target) await page.$eval(selectorFor(target), (el) => el.scrollIntoView({ block: "center" }));
                    else await page.evaluate((px) => window.scrollBy(0, px), Number(value) || 700);
                    break;
                case "wait":
                    await new Promise((r) => setTimeout(r, Math.min(Number(value) || 2000, 10000)));
                    break;
                case "look":
                    break;
                default:
                    throw new Error("action must be click, fill, select, press, scroll, wait or look");
            }
        } catch (err) {
            note(`${action} failed: ${String(err.message).split("\n")[0].slice(0, 300)}`);
        }
        return snapshot({ full: action === "look" && full, caption: action === "look" && full ? `${device}: whole page` : `${device}: after ${action}` });
    }

    async function close() {
        if (browser) await browser.close().catch(() => {});
        browser = null;
        page = null;
    }

    return { open, act, close, shots, tracking };
}

module.exports = { createVisitor };
