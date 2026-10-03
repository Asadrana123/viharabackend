// services/leads/buyBox.js
//
// Shared server-side handling for the buy-box landing pages (/buyer-list and
// /new-deals): sanitizing the form, the price tolerance rule, UTM touches and
// the small request helpers both controllers use. Each page keeps its own
// allowed values / tier rules and passes them in.

const MAX_PRICE = 3000000;
const TOUCH_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];

const STRATEGIES = ["flip", "rent", "brrrr", "wholesale", "home"];
const CONDITIONS = ["turnkey", "light_rehab", "heavy_rehab", "any"];
const FINANCING = ["cash", "hard_money", "mortgage", "not_sure"];
const DEALS_12MO = ["1", "2_5", "6_plus"];
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

// ── sanitizers ──────────────────────────────────────────────────────────────
const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pickList = (v, allowed) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter((x) => allowed.includes(x)))] : [];
const pickOne = (v, allowed) => (allowed.includes(String(v)) ? String(v) : "");
const toPrice = (v) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), MAX_PRICE) : null;
};

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Same tolerance rule the pages show: +/-$10K under $100K, +/-$20K at $100K+.
const tolerance = (n) => (n < 100000 ? 10000 : 20000);

// "CA,NY" env value → ["CA","NY"].
const marketList = (value, fallback) =>
  String(value || fallback)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

const cleanTouch = (t) => {
  if (!t || typeof t !== "object") return null;
  const out = {};
  TOUCH_KEYS.forEach((k) => {
    out[k] = str(t[k], 500);
  });
  const ts = t.ts ? new Date(t.ts) : null;
  out.ts = ts && !Number.isNaN(ts.getTime()) ? ts : null;
  return out;
};

/** First/last touch from the payload. Storage-blocked browsers send no first touch → use last. */
const touchesFrom = (body, now = new Date()) => {
  const lastTouch = cleanTouch(body.last_touch) || { utm_source: "direct", ts: now };
  if (!lastTouch.utm_source) lastTouch.utm_source = "direct";
  const firstTouch = cleanTouch(body.first_touch) || lastTouch;
  if (!firstTouch.utm_source) firstTouch.utm_source = "direct";
  return { firstTouch, lastTouch };
};

/**
 * Sanitize the buy box and recompute the match range server-side.
 * @param {object} raw            body.buy_box
 * @param {string[]} propertyTypes allowed property_type values for this page
 */
const buildBuyBox = (raw = {}, propertyTypes) => {
  let priceMin = toPrice(raw.price_min);
  let priceMax = toPrice(raw.price_max); // null = no upper limit ($3M+)
  if (priceMin === null) priceMin = 0;
  if (priceMax !== null && priceMax < priceMin) [priceMin, priceMax] = [priceMax, priceMin];
  if (priceMax !== null && priceMax >= MAX_PRICE) priceMax = null;

  return {
    strategy: pickList(raw.strategy, STRATEGIES),
    property_type: pickList(raw.property_type, propertyTypes),
    states: pickList(Array.isArray(raw.states) ? raw.states.map((s) => String(s).toUpperCase()) : [], US_STATES),
    cities: Array.isArray(raw.cities)
      ? [...new Set(raw.cities.map((c) => str(c, 80)).filter(Boolean))].slice(0, 25)
      : [],
    price_min: priceMin,
    price_max: priceMax,
    match_min: Math.max(0, priceMin - tolerance(priceMin)),
    match_max: priceMax === null ? null : priceMax + tolerance(priceMax),
    condition: pickOne(raw.condition, CONDITIONS),
    financing: pickOne(raw.financing, FINANCING),
    deals_12mo: pickOne(raw.deals_12mo, DEALS_12MO),
  };
};

const attributionFrom = (raw, extraKeys = []) => {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  [...TOUCH_KEYS, ...extraKeys].forEach((k) => {
    out[k] = str(src[k], 500);
  });
  return out;
};

// Real client IP behind the proxy (first X-Forwarded-For hop), for Meta CAPI.
const clientIp = (req) => {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || undefined;
};

// Only production page URLs reach Meta (mirrors capi.service.js on the client),
// so localhost / preview test sign-ups never pollute the pixel.
const isProductionPageUrl = (url) => {
  try {
    return ["vihara.ai", "www.vihara.ai"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

// Resolve within `ms`, never rejecting — a 200 must not hang on Brevo.
const withTimeout = (promise, ms, timeoutValue = { success: false, error: "timeout" }) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(timeoutValue), ms))]);

// ── Speech helpers (Maya reads these aloud) ─────────────────────────────────
const SPEECH_LABELS = {
  strategy: { flip: "fix and flip", rent: "rental or buy-and-hold", brrrr: "BRRRR", wholesale: "wholesale", home: "a home to live in" },
  property_type: {
    sfr: "single-family", condo: "condo or townhome", mf_2_4: "two to four units",
    mf_5_plus: "five-plus units", land: "land", mixed_use: "mixed-use",
  },
  condition: { turnkey: "turnkey", light_rehab: "light rehab", heavy_rehab: "heavy rehab", any: "any condition" },
  financing: { cash: "cash", hard_money: "hard or private money", mortgage: "a mortgage", not_sure: "not sure yet" },
  deals_12mo: { 1: "one deal", "2_5": "two to five deals", "6_plus": "six or more deals" },
};
const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "Washington D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Form labels exactly as the buyer saw them (welcome email, admin text).
const FORM_LABELS = {
  strategy: { flip: "Fix & flip", rent: "Rental / hold", brrrr: "BRRRR", wholesale: "Wholesale", home: "Home to live in" },
  property_type: {
    sfr: "Single-family", condo: "Condo / townhome", mf_2_4: "2–4 units",
    mf_5_plus: "5+ units", land: "Land", mixed_use: "Mixed-use",
  },
  condition: { turnkey: "Turnkey", light_rehab: "Light rehab", heavy_rehab: "Heavy rehab", any: "Any condition" },
  financing: { cash: "Cash", hard_money: "Hard / private money", mortgage: "Mortgage", not_sure: "Not sure yet" },
  deals_12mo: { 1: "1", "2_5": "2–5", "6_plus": "6+" },
};
const labelList = (group, values = []) =>
  (Array.isArray(values) ? values : [values])
    .filter(Boolean)
    .map((v) => (FORM_LABELS[group] && FORM_LABELS[group][v]) || v)
    .join(", ");

// "$70K – $400K" / "$130K – $3M+" — the page's own price wording.
const kText = (n) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`);
const priceRangeText = (box = {}) => {
  if (!Number.isFinite(box.price_min)) return "";
  // Nothing picked (no floor, no ceiling) → leave the line out.
  if (!box.price_min && (box.price_max === null || box.price_max === undefined)) return "";
  if (box.price_max === null || box.price_max === undefined) return `${kText(box.price_min)} – $3M+`;
  return box.price_min === box.price_max ? kText(box.price_min) : `${kText(box.price_min)} – ${kText(box.price_max)}`;
};

/** "Jack van der Berg" → { firstName: "Jack", lastName: "van der Berg" } */
const splitName = (full = "") => {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
};

const spokenList = (group, values = []) =>
  (Array.isArray(values) ? values : [values])
    .filter(Boolean)
    .map((v) => (SPEECH_LABELS[group] && SPEECH_LABELS[group][v]) || v)
    .join(", ");

const stateName = (code) => STATE_NAMES[code] || code;

// 130000 → "one hundred thirty thousand dollars" is overkill for TTS; VAPI voices
// read "$130,000" fine, so keep a plain formatted figure.
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const spokenBudget = (box = {}) => {
  if (!Number.isFinite(box.price_min)) return "";
  if (box.price_max === null || box.price_max === undefined) return `${usd(box.price_min)} and up`;
  return `${usd(box.price_min)} to ${usd(box.price_max)}`;
};

module.exports = {
  MAX_PRICE,
  TOUCH_KEYS,
  US_STATES,
  str,
  isValidEmail,
  tolerance,
  marketList,
  touchesFrom,
  buildBuyBox,
  attributionFrom,
  clientIp,
  isProductionPageUrl,
  withTimeout,
  spokenList,
  spokenBudget,
  stateName,
  labelList,
  priceRangeText,
  splitName,
};
