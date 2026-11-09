// services/propertyFunnel/pfCore.js
//
// Property Funnel: small pure helpers, ported from Prajwal's server/core.ts (vihara-property-dashboard),
// plus our own status and state mapping. No I/O.

// ---------------------------------------------------------------- dates (Pacific)

const TZ = "America/Los_Angeles";
const PACIFIC = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Pacific time. Accepts a Date, an ISO string or a timestamp. */
const pacificDate = (d) => PACIFIC.format(new Date(d));

function addDays(d, n) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** The first instant of a Pacific day (handles PST and PDT). */
function pacificDayStart(ymd) {
  // Try both offsets; the right one gives back the same Pacific date at 00:00.
  for (const off of ["-08:00", "-07:00"]) {
    const t = new Date(`${ymd}T00:00:00${off}`);
    if (pacificDate(t) === ymd && pacificDate(new Date(t.getTime() - 1)) !== ymd) return t;
  }
  return new Date(`${ymd}T00:00:00-08:00`);
}

/** A Date from a Date or a date string (some listings store auctionStartDate as text). null if neither. */
function toDate(v) {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------- property slug from a URL

/**
 * The join key is the listing slug. Read it from any Vihara URL:
 *   /listing/<slug>   /auction/<slug>   /deal?property=<slug>   ...?property=<slug>
 * null for pages that cover several properties (/find, /new-deals) or none.
 */
function slugFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, "https://www.vihara.ai");
    const q = u.searchParams.get("property");
    if (q) return q.split(",")[0].trim() || null;
    const m = u.pathname.match(/^\/(?:listing|auction)\/([a-z0-9-]+)/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- channels

/** GA4 sessionDefaultChannelGroup (+ source/medium) → one of the six channels. */
function channelFromGa4(group, sourceMedium = "") {
  const g = String(group || "").toLowerCase();
  const sm = String(sourceMedium || "").toLowerCase();
  if (g === "paid social" || (/(facebook|instagram|fb|ig|meta)/.test(sm) && /(paid|cpc|ppc|ads?)\b/.test(sm))) return "Meta ads";
  if (g === "organic social") return "Organic social";
  if (g === "organic search" || g === "paid search") return "Search";
  if (g === "email" || g === "sms") return "Email & SMS";
  if (g === "direct") return "Direct";
  return "Other";
}

/** A lead's source + utm → one of the six channels. `source === "meta_form"` = a Meta instant form. */
function channelFromLead(source, utm = {}) {
  if (source === "meta_form") return "Meta ads";
  const s = String(utm.utm_source || utm.source || "").toLowerCase();
  const m = String(utm.utm_medium || utm.medium || "").toLowerCase();
  const paid = /(paid|cpc|ppc|ads?|paid_social)/.test(m);
  if (/(meta|facebook|fb|instagram|ig)/.test(s)) return paid ? "Meta ads" : "Organic social";
  if (/(linkedin|youtube|tiktok|threads|x|twitter)/.test(s)) return "Organic social";
  if (m === "email" || m === "sms" || /(brevo|sendgrid|vtext)/.test(s)) return "Email & SMS";
  if (/(google|bing)/.test(s)) return "Search";
  if (!s && !m) return "Direct";
  return "Other";
}

// ---------------------------------------------------------------- awareness

/** Cold / Warm / Hot from an ad set's custom audiences (Meta subtypes). Lookalikes stay Cold. */
function awarenessFromAudiences(audiences) {
  if (!audiences || !audiences.length) return "Cold";
  const subs = audiences.map((a) => String((a && a.subtype) || "").toUpperCase());
  if (subs.some((s) => s === "CUSTOM" || s === "OFFLINE_CONVERSION")) return "Hot";
  if (subs.some((s) => ["WEBSITE", "ENGAGEMENT", "VIDEO", "APP", "IG_BUSINESS", "FB_EVENT"].includes(s))) return "Warm";
  return "Cold";
}

// ---------------------------------------------------------------- contacts: matching keys and masking

/** Phone as 10 US digits ("+1 (410) 555-2291" → "4105552291"), for matching texts, calls and registrations. */
const phoneKey = (p) => String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
/** Email trimmed and lowercased, for matching. */
const emailKey = (e) => String(e || "").trim().toLowerCase();
/** "+1XXXXXXXXXX" for a 10-digit key, the format Vtext and the call logs store. */
const e164 = (key) => (key && key.length === 10 ? `+1${key}` : null);

/** "+14105552291" → "(410) •••-2291". The page never gets the full number. */
function maskPhone(phone) {
  if (!phone) return null;
  const d = phoneKey(phone);
  if (d.length < 7) return "•••";
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(-4)}` : `•••-${d.slice(-4)}`;
}
/** "jane.doe@gmail.com" → "j•••@gmail.com" */
function maskEmail(email) {
  if (!email || !String(email).includes("@")) return null;
  const [user, domain] = String(email).trim().split("@");
  return `${user.slice(0, 1)}•••@${domain}`;
}

// ---------------------------------------------------------------- properties

/**
 * Our listing status → the page's. Agreed with Prajwal (9 Nov 2026): archived → withdrawn,
 * pending → upcoming. Archived wins over every status.
 */
function toStatus(status, archived) {
  if (archived) return "withdrawn";
  switch (String(status || "").toLowerCase()) {
    case "sold": return "sold";
    case "cancelled": return "ended";
    case "pending": return "upcoming";
    default: return "live";
  }
}

const STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
/** Two-letter state code ("Texas" → "TX", "ca" → "CA"). Unknown text is returned as it was. */
function stateCode(s) {
  const t = String(s || "").trim();
  if (/^[a-z]{2}$/i.test(t)) return t.toUpperCase();
  return STATES[t.toLowerCase()] || t;
}

/** Answer to "what best describes you" → the page's buyer types. null when unknown. */
function buyerType(v) {
  const p = String(v || "").toLowerCase();
  if (!p) return null;
  if (/agent|broker|realtor/.test(p)) return "Agent";
  if (/first/.test(p)) return "First-time buyer";
  if (/live|home|own|occupant|primary/.test(p)) return "Owner-occupier";
  if (/flip|rent|invest|portfolio|wholesale|cash|hold|brrrr/.test(p)) return "Investor";
  return null;
}

module.exports = {
  TZ, pacificDate, addDays, pacificDayStart, toDate,
  slugFromUrl, channelFromGa4, channelFromLead, awarenessFromAudiences,
  phoneKey, emailKey, e164, maskPhone, maskEmail,
  toStatus, stateCode, buyerType,
};
