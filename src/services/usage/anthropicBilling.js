// services/usage/anthropicBilling.js
/**
 * Anthropic's own record of what the organization spent: by API key, model, product and day, from the
 * Usage and Cost Analytics API (GET /v1/organizations/analytics/cost, beta analytics-usage-cost-2026-08-24).
 * Unlike the spend this backend and the Creative OS record themselves, it covers everything billed to the
 * account, from before tracking began, whichever key or machine spent it. It is what answers "where are the
 * credits going".
 *
 * Needs ANTHROPIC_ADMIN_KEY: an Admin API key (sk-ant-admin01-...) that an organization admin creates in the
 * Claude Console (Settings > Admin keys). A normal API key is refused by these endpoints.
 *
 * Limits from Anthropic: data from 2026-01-01 and the last 365 days, at most 31 days a request (longer
 * periods are split), about 5 minutes behind. Polling once a minute is fine; results are kept 10 minutes.
 */
const API = "https://api.anthropic.com/v1/organizations";
const HEADERS = (key) => ({
  "x-api-key": key,
  "anthropic-version": "2026-10-21",
  "anthropic-beta": "analytics-usage-cost-2026-08-24",
  "user-agent": "vihara-admin-ai-spend/1.0",
});
const DAY = 864e5;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

const adminKey = () => process.env.ANTHROPIC_ADMIN_KEY || "";

/** "41280.000000" (cents) -> 412.8 */
const centsToUsd = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : 0;
};

async function getJson(url, key, fetchImpl) {
  const res = await fetchImpl(url, { headers: HEADERS(key), signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    const err = new Error(res.status === 401 || res.status === 403 ? `Anthropic refused the admin key (${msg}). It must be an Admin API key (sk-ant-admin01-...) from an organization admin.` : `Anthropic's cost report failed: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/** Splits [from, to) into windows of at most 31 days, starting no earlier than 2026-01-01 or 365 days ago. */
function windows(from, to, now = new Date()) {
  const floor = Math.max(Date.parse("2026-01-01T00:00:00Z"), now.getTime() - 364 * DAY);
  const start = new Date(Math.max(from.getTime(), floor));
  // Whole UTC days, so daily buckets line up.
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(Math.min(to.getTime(), now.getTime()));
  const out = [];
  for (let s = start.getTime(); s < end.getTime(); s += 31 * DAY) out.push([new Date(s), new Date(Math.min(s + 31 * DAY, end.getTime()))]);
  return out;
}

/** All rows of one cost query across its pages. */
async function costRows(key, params, fetchImpl) {
  const rows = [];
  let page = null;
  for (let i = 0; i < 50; i++) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const item of [].concat(v)) q.append(k, item);
    if (page) q.set("page", page);
    const body = await getJson(`${API}/analytics/cost?${q.toString()}`, key, fetchImpl);
    rows.push(...(body.data || []));
    if (!body.has_more || !body.next_page) return { rows, refreshedAt: body.data_refreshed_at || null };
    page = body.next_page;
  }
  return { rows, refreshedAt: null };
}

/** The organization's API keys by id, with their names, so a key shows as "DigitalOcean server", not apikey_01... */
async function apiKeyNames(key, fetchImpl) {
  const names = {};
  let after = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ limit: "100" });
    if (after) q.set("after_id", after);
    let body;
    try {
      body = await getJson(`${API}/api_keys?${q.toString()}`, key, fetchImpl);
    } catch {
      return names; // Names are a convenience; the costs still show with the key's id.
    }
    for (const k of body.data || []) names[k.id] = { name: k.name || k.id, status: k.status || "", hint: k.partial_key_hint || "" };
    if (!body.has_more || !body.last_id) break;
    after = body.last_id;
  }
  return names;
}

const keyLabel = (id, names) => (id ? names[id]?.name || id : "No API key (Console, Claude Code sign-in)");

/**
 * Turns the cost rows into the page's numbers. byKeyModel: rows grouped by api_key_id and model over the
 * whole period; daily: rows grouped by api_key_id with 1d buckets.
 */
function shapeBilling({ byKeyModel, daily, names, from, to }) {
  const keys = new Map();
  const models = new Map();
  let total = 0;
  let requests = 0;
  for (const r of byKeyModel) {
    const usd = centsToUsd(r.cost?.amount);
    const req = Number(r.cost?.requests) || 0;
    total += usd;
    requests += req;
    const id = r.group?.api_key_id || null;
    const k = keys.get(id) || { id, name: keyLabel(id, names), status: id ? names[id]?.status || "" : "", hint: id ? names[id]?.hint || "" : "", usd: 0, requests: 0, models: new Map() };
    k.usd += usd;
    k.requests += req;
    const model = r.group?.model || "Other (tools, code execution)";
    k.models.set(model, (k.models.get(model) || 0) + usd);
    keys.set(id, k);
    const m = models.get(model) || { model, usd: 0, requests: 0 };
    m.usd += usd;
    m.requests += req;
    models.set(model, m);
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  const keyList = [...keys.values()].sort((a, b) => b.usd - a.usd).map((k) => ({ ...k, usd: round2(k.usd), models: [...k.models].map(([model, usd]) => ({ model, usd: round2(usd) })).sort((a, b) => b.usd - a.usd) }));

  // Daily series: the five biggest keys by name, the rest as "Other keys".
  const top = keyList.slice(0, 5).map((k) => k.id);
  const series = top.map((id) => ({ id: id || "none", name: keyLabel(id, names) }));
  if (keyList.length > 5) series.push({ id: "other", name: "Other keys" });
  const days = new Map();
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t < to.getTime(); t += DAY) days.set(new Date(t).toISOString().slice(0, 10), { day: new Date(t).toISOString().slice(0, 10), total: 0 });
  for (const r of daily) {
    const day = String(r.starting_at || "").slice(0, 10);
    const d = days.get(day) || { day, total: 0 };
    const id = r.group?.api_key_id || null;
    const slot = top.includes(id) ? id || "none" : "other";
    const usd = centsToUsd(r.cost?.amount);
    d[slot] = round2((d[slot] || 0) + usd);
    d.total = round2(d.total + usd);
    days.set(day, d);
  }
  return {
    total: round2(total),
    requests,
    keys: keyList,
    models: [...models.values()].map((m) => ({ ...m, usd: round2(m.usd) })).sort((a, b) => b.usd - a.usd),
    series,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** The Anthropic bill for a period, or { configured: false } without an admin key. */
async function anthropicBilling(from, to, { fetchImpl = fetch, now = new Date(), key = adminKey() } = {}) {
  if (!key) return { configured: false };
  const cacheKey = `${from.toISOString().slice(0, 13)}|${to.toISOString().slice(0, 13)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const spans = windows(from, to, now);
  const byKeyModel = [];
  const daily = [];
  let refreshedAt = null;
  for (const [s, e] of spans) {
    const base = { starting_at: s.toISOString(), ending_at: e.toISOString() };
    const a = await costRows(key, { ...base, "group_by[]": ["api_key_id", "model"], limit: "1000" }, fetchImpl);
    const b = await costRows(key, { ...base, time_bucket_width: "1d", order_by: "time", order: "asc", "group_by[]": ["api_key_id"], limit: "1000" }, fetchImpl);
    byKeyModel.push(...a.rows);
    daily.push(...b.rows);
    refreshedAt = b.refreshedAt || a.refreshedAt || refreshedAt;
  }
  const names = await apiKeyNames(key, fetchImpl);
  const value = { configured: true, from: spans[0]?.[0] || from, to, refreshedAt, ...shapeBilling({ byKeyModel, daily, names, from: spans[0]?.[0] || from, to }) };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

module.exports = { anthropicBilling, shapeBilling, windows, centsToUsd };
