// The only way the test-phase agent can reach the app. The worker makes the
// request; the agent only describes it. That lets the worker:
//   - attach the QA token (QA test mode) and login cookies without the model
//     ever seeing a secret;
//   - refuse endpoints with real-world effects (QA/worker API, webhooks,
//     Vapi, Meta, unsubscribe);
//   - allow data-changing requests only to endpoints that support QA test
//     mode, so a test can never send a real call, Slack post or email.
import { config } from "../config.js";
import { api } from "../api.js";

// Writes (anything but GET/HEAD) are allowed only here. Add an endpoint once
// its controller honours req.isQaTest (see middleware/qaAgentAuth.js).
export const QA_MODE_WRITE_ENDPOINTS = [
  { method: "POST", path: /^\/api\/v1\/property-lead\/[a-z0-9-]+\/register$/i, name: "property auction registration" },
];

const BLOCKED_PREFIXES = [
  "/api/v1/qa-agent", "/api/v1/qa/", "/api/webhooks", "/api/vapi", "/api/capi", "/api/facebook", "/api/unsubscribe",
];
const BLOCKED_EXACT = ["/api/v1/qa"];

export const MAX_REQUESTS_PER_RUN = 400;
const MAX_PARALLEL = 5;
const MAX_RESPONSE_CHARS = 12_000;
const TIMEOUT_MS = 20_000;

/** Returns a reason string if the request isn't allowed, else null. */
export function checkRequest(method, path) {
  if (typeof path !== "string" || !path.startsWith("/api/")) return 'path must start with "/api/" (no host, no full URL)';
  if (/[\s#]|\.\./.test(path)) return "path must not contain spaces, '#' or '..'";
  const bare = path.split("?")[0].toLowerCase();
  if (BLOCKED_EXACT.includes(bare) || BLOCKED_PREFIXES.some((p) => bare.startsWith(p))) {
    return "this endpoint is off limits to the QA agent (QA admin API, webhooks, calling, Meta or unsubscribe)";
  }
  if (method !== "GET" && method !== "HEAD") {
    const allowed = QA_MODE_WRITE_ENDPOINTS.some((e) => e.method === method && e.path.test(bare));
    if (!allowed) {
      return `${method} ${bare} does not support QA test mode yet, so it could cause real side effects. ` +
        "Mark checks that need it as not_verified and say why. Writes are allowed only to: " +
        QA_MODE_WRITE_ENDPOINTS.map((e) => `${e.method} ${e.name}`).join(", ");
    }
  }
  return null;
}

export function createHttpClient(log) {
  const sessions = {}; // role → { cookie, expiresAt }
  let requestCount = 0;

  const cookieFor = async (as) => {
    if (as === "visitor") return null;
    const current = sessions[as];
    if (current && current.expiresAt - Date.now() > 5 * 60_000) return current.cookie;
    const { token, expiresAt } = await api.testSession(as);
    sessions[as] = { cookie: `token=${token}`, expiresAt: new Date(expiresAt).getTime() };
    return sessions[as].cookie;
  };

  const once = async ({ method, path, query, body, as }) => {
    const url = new URL(config.apiUrl + path);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
    const headers = { "x-qa-agent-token": config.agentToken };
    const cookie = await cookieFor(as);
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const started = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      let parsed = text;
      try { parsed = JSON.parse(text); } catch { /* not JSON — keep text */ }
      const out = { status: res.status, ms: Date.now() - started, contentType: res.headers.get("content-type") || "", body: parsed };
      if (text.length > MAX_RESPONSE_CHARS) {
        out.body = `${text.slice(0, MAX_RESPONSE_CHARS)}… [truncated, ${text.length} chars total — use query params to narrow it]`;
      }
      return out;
    } catch (err) {
      return { error: err.name === "TimeoutError" ? `no response within ${TIMEOUT_MS / 1000}s` : err.message, ms: Date.now() - started };
    }
  };

  /** request: { method, path, query?, body?, as?, parallel? } */
  async function request({ method = "GET", path, query, body, as = "visitor", parallel = 1 }) {
    method = String(method).toUpperCase();
    const blocked = checkRequest(method, path);
    if (blocked) return { blocked };
    if (!["visitor", "user", "admin"].includes(as)) return { blocked: 'as must be "visitor", "user" or "admin"' };
    const n = Math.min(MAX_PARALLEL, Math.max(1, Number(parallel) || 1));
    if (requestCount + n > MAX_REQUESTS_PER_RUN) {
      return { blocked: `request limit for this run reached (${MAX_REQUESTS_PER_RUN}). Record what you have and finish.` };
    }
    requestCount += n;
    log(`http ${method} ${path} as ${as}${n > 1 ? ` ×${n} parallel` : ""}`);
    const req = { method, path, query, body, as };
    if (n === 1) return once(req);
    return { parallelResults: await Promise.all(Array.from({ length: n }, () => once(req))) };
  }

  return { request, get requestCount() { return requestCount; } };
}
