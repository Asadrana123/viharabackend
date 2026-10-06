// The test-phase agent's browser. Like http_request, the worker drives it and
// the agent only describes what to do, so the worker can:
//   - log the browser in as the QA test accounts (cookie set here, never shown
//     to the model);
//   - add the QA token to every call the website makes to our backend, so
//     endpoints with QA test mode skip real-world side effects;
//   - apply the same rules as http_request to those calls (checkRequest):
//     writes only to QA-mode endpoints, never the QA/webhook/calling APIs;
//   - stop the page from reaching anything else that could have an effect:
//     third-party writes, trackers (Meta pixel, analytics), other backends,
//     and live sockets (realtime checks aren't supported yet).
import { chromium } from "playwright";
import { config } from "../config.js";
import { api } from "../api.js";
import { checkRequest } from "./httpTool.js";

export const MAX_BROWSER_ACTIONS = 300;
const ACTION_TIMEOUT_MS = 10_000;
const NAV_TIMEOUT_MS = 30_000;
const MAX_SNAPSHOT_CHARS = 10_000;
const MAX_EVENTS = 25;

const ROLES = ["visitor", "user", "admin"];
const TRACKERS = /(^|\.)(facebook\.com|facebook\.net|google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|hotjar\.com|clarity\.ms|segment\.(io|com)|mixpanel\.com|posthog\.com|tiktok\.com|linkedin\.com|licdn\.com|vercel-insights\.com)$/i;
const THIRD_PARTY_READ_TYPES = new Set(["script", "stylesheet", "image", "font", "media", "fetch", "xhr"]);

const apiOrigin = new URL(config.apiUrl).origin;
const siteOrigin = new URL(config.frontendUrl).origin;

/** Decides what the page may load. Returns { allow, token?, reason? }. */
export function classifyBrowserRequest({ method, url, resourceType, isNavigation }) {
  let u;
  try { u = new URL(url); } catch { return { allow: false, reason: "invalid URL" }; }
  if (u.protocol === "data:" || u.protocol === "blob:") return { allow: true };

  if (u.origin === apiOrigin) {
    if (method === "OPTIONS") return { allow: true };
    if (u.pathname.startsWith("/socket.io")) return { allow: false, reason: "live socket — realtime checks aren't supported yet" };
    const blocked = checkRequest(method, u.pathname + u.search);
    return blocked ? { allow: false, reason: blocked } : { allow: true, token: true };
  }

  // The website's own files (dev server, built assets).
  if (u.origin === siteOrigin) return { allow: true };

  // Our API on any other host means the website points at a different backend
  // (e.g. production) — never let a test touch it.
  if (u.pathname.startsWith("/api/") || /(^|\.)vihara\.ai$/i.test(u.hostname)) {
    return { allow: false, reason: `the website called a different backend (${u.origin}); tests may only use ${apiOrigin}` };
  }
  if (TRACKERS.test(u.hostname)) return { allow: false, reason: "tracker/analytics blocked during tests" };
  if (isNavigation) return { allow: false, reason: `navigation away from the website (${u.origin}) is blocked` };
  if (method !== "GET" && method !== "HEAD") return { allow: false, reason: "third-party writes are blocked during tests" };
  if (!THIRD_PARTY_READ_TYPES.has(resourceType)) return { allow: false, reason: `third-party ${resourceType} blocked` };
  return { allow: true }; // maps, fonts, CDNs
}

/** Builds a Playwright locator from the agent's description of an element. */
function locate(page, target) {
  if (!target || typeof target !== "object") throw new Error("target is required for this action");
  const exact = Boolean(target.exact);
  let loc;
  if (target.role) loc = page.getByRole(target.role, target.name ? { name: target.name, exact } : {});
  else if (target.label) loc = page.getByLabel(target.label, { exact });
  else if (target.placeholder) loc = page.getByPlaceholder(target.placeholder, { exact });
  else if (target.text) loc = page.getByText(target.text, { exact });
  else if (target.testId) loc = page.getByTestId(target.testId);
  else if (target.css) loc = page.locator(target.css);
  else throw new Error("target needs one of: role (+name), label, placeholder, text, testId, css");
  return target.nth !== undefined ? loc.nth(target.nth) : loc;
}

const stripAnsi = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, "");
const shortError = (err) => stripAnsi(err?.message || err).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4).join(" | ").slice(0, 600);
// Console errors worth showing: skip React dev warnings and the echo of requests we blocked ourselves.
const CONSOLE_NOISE = /^Warning: |ERR_BLOCKED_BY_CLIENT/;

export function createBrowser(log) {
  let browser = null;
  const tabs = {}; // role → { context, page, events: [] }
  let actionCount = 0;

  const note = (tab, text) => {
    if (tab.events[tab.events.length - 1] === text) return; // skip exact repeats (polling, retries)
    tab.events.push(text);
    if (tab.events.length > MAX_EVENTS * 2) tab.events.splice(0, tab.events.length - MAX_EVENTS);
  };

  async function tabFor(as) {
    if (tabs[as]) return tabs[as];
    if (!browser) {
      browser = await chromium.launch({ headless: true });
      log("browser started");
    }
    const context = await browser.newContext({ viewport: { width: 1366, height: 850 }, serviceWorkers: "block" });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    const tab = { context, page: null, events: [] };

    if (as !== "visitor") {
      const { token } = await api.testSession(as);
      const secure = apiOrigin.startsWith("https:");
      await context.addCookies([{ name: "token", value: token, url: config.apiUrl, httpOnly: true, secure, sameSite: secure ? "None" : "Lax" }]);
    }

    await context.route("**/*", async (route) => {
      const req = route.request();
      const decision = classifyBrowserRequest({
        method: req.method(), url: req.url(), resourceType: req.resourceType(), isNavigation: req.isNavigationRequest(),
      });
      if (!decision.allow) {
        const u = new URL(req.url());
        note(tab, `blocked ${req.method()} ${u.origin === apiOrigin ? u.pathname : u.origin + u.pathname} — ${decision.reason}`);
        return route.abort("blockedbyclient").catch(() => {});
      }
      if (decision.token) {
        return route.continue({ headers: { ...req.headers(), "x-qa-agent-token": config.agentToken } }).catch(() => {});
      }
      return route.continue().catch(() => {});
    });
    // Live sockets to our backend could place bids or join auctions; keep them closed for now.
    await context.routeWebSocket((url) => url.origin === apiOrigin, (ws) => ws.close({ code: 1000, reason: "blocked by QA worker" }));

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() !== "error" || CONSOLE_NOISE.test(msg.text())) return;
      note(tab, `console error: ${msg.text().split("\n")[0].slice(0, 300)}`);
    });
    page.on("pageerror", (err) => note(tab, `page crashed: ${shortError(err)}`));
    page.on("response", (res) => {
      const u = new URL(res.url());
      if (u.origin === apiOrigin && res.status() >= 400) note(tab, `${res.request().method()} ${u.pathname} → ${res.status()}`);
    });
    page.on("dialog", (dialog) => {
      note(tab, `${dialog.type()} dialog: "${dialog.message().slice(0, 300)}" (${dialog.type() === "alert" ? "closed" : "dismissed"})`);
      (dialog.type() === "alert" ? dialog.accept() : dialog.dismiss()).catch(() => {});
    });
    page.on("popup", (popup) => { note(tab, `page tried to open a new tab: ${popup.url()} (closed)`); popup.close().catch(() => {}); });
    tab.page = page;
    tabs[as] = tab;
    return tab;
  }

  /** Page state after an action: where we are, what happened, what's on screen. */
  async function describe(tab, { within, screenshot } = {}) {
    const { page } = tab;
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    const out = { url: page.url().replace(siteOrigin, ""), title: await page.title().catch(() => "") };
    if (tab.events.length) out.events = tab.events.splice(0).slice(-MAX_EVENTS);
    try {
      let snap = await (within ? locate(page, within) : page.locator("body")).first().ariaSnapshot({ timeout: 5000 });
      if (snap.length > MAX_SNAPSHOT_CHARS) snap = `${snap.slice(0, MAX_SNAPSHOT_CHARS)}\n… [truncated — use browser_look with "within" to see one part of the page]`;
      out.snapshot = snap;
    } catch (err) {
      out.snapshot = `(could not read the page: ${shortError(err)})`;
    }
    const image = screenshot ? (await page.screenshot({ type: "jpeg", quality: 60, fullPage: screenshot === "full" })).toString("base64") : null;
    return { out, image };
  }

  const countAction = () => {
    if (actionCount >= MAX_BROWSER_ACTIONS) return `browser action limit for this run reached (${MAX_BROWSER_ACTIONS}). Record what you have and finish.`;
    actionCount += 1;
    return null;
  };

  async function open({ path, as = "visitor" }) {
    if (!ROLES.includes(as)) return { blocked: 'as must be "visitor", "user" or "admin"' };
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /\s/.test(path)) {
      return { blocked: 'path must be a website path starting with "/", e.g. "/listing/123-main-st"' };
    }
    const limit = countAction();
    if (limit) return { blocked: limit };
    log(`browser open ${path} as ${as}`);
    const tab = await tabFor(as);
    try {
      const res = await tab.page.goto(siteOrigin + path, { waitUntil: "domcontentloaded" });
      if (res && res.status() >= 400) note(tab, `page returned HTTP ${res.status()}`);
    } catch (err) {
      const msg = shortError(err);
      if (/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED/.test(msg)) {
        return { error: `The website isn't reachable at ${siteOrigin} — is the frontend running? Record ui checks as not_verified.` };
      }
      note(tab, `navigation problem: ${msg}`);
    }
    return describe(tab);
  }

  async function act({ as = "visitor", action, target, value, screenshot }) {
    if (!tabs[as]) return { blocked: `no page open as ${as} yet — call browser_open first` };
    const limit = countAction();
    if (limit) return { blocked: limit };
    const tab = tabs[as];
    const { page } = tab;
    log(`browser ${action} as ${as}${target ? ` ${JSON.stringify(target).slice(0, 120)}` : ""}`);
    try {
      switch (action) {
        case "click": await locate(page, target).click(); break;
        case "fill": await locate(page, target).fill(String(value ?? "")); break;
        case "select": await locate(page, target).selectOption(String(value ?? "")); break;
        case "check": await locate(page, target).check(); break;
        case "uncheck": await locate(page, target).uncheck(); break;
        case "hover": await locate(page, target).hover(); break;
        case "press":
          if (target) await locate(page, target).press(String(value || "Enter"));
          else await page.keyboard.press(String(value || "Enter"));
          break;
        case "scroll": await page.mouse.wheel(0, Number(value) || 600); break;
        case "wait":
          if (target) await locate(page, target).first().waitFor({ state: "visible" });
          else await page.waitForTimeout(Math.min(10_000, Math.max(200, Number(value) || 1000)));
          break;
        case "back": await page.goBack({ waitUntil: "domcontentloaded" }); break;
        default: return { blocked: `unknown action "${action}"` };
      }
    } catch (err) {
      const { out, image } = await describe(tab, { screenshot });
      return { out: { actionFailed: shortError(err), ...out }, image };
    }
    return describe(tab, { screenshot });
  }

  async function look({ as = "visitor", within, screenshot }) {
    if (!tabs[as]) return { blocked: `no page open as ${as} yet — call browser_open first` };
    return describe(tabs[as], { within, screenshot });
  }

  async function close() {
    if (browser) await browser.close().catch(() => {});
    browser = null;
  }

  return { open, act, look, close, get actionCount() { return actionCount; } };
}
