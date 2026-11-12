// services/calling/listingSearchService.js
//
// Maya's live-listings knowledge. Two parts:
//
//   1. findListings tool — mid-call, the caller asks "anything in Atlanta under
//      300k?" → Vapi calls our webhook → searchListings() filters the live
//      listings straight from Mongo (no LLM, no vector search: exact prices,
//      always current) → formatToolResult() hands Maya a short spoken-ready
//      answer with at most MAX_RESULTS homes.
//
//   2. buildListingsContext(person) — before the call is placed, a small block
//      for the system prompt: how many homes are live and in which states, plus
//      up to PRELOAD_RESULTS homes that match what the lead told us on the form
//      (market / areas / city, budget, bedrooms). Most "what do you have near
//      me?" questions are answered from this block with no tool round-trip.
//
// "Live" = what the public /auctions page shows (productController.getAllProducts:
// showOnAuctions, not a test property, not sold), minus cancelled auctions.
// Reserve prices and anything not on the public page are never selected.
const productModel = require("../../model/property/productModel");
const { listingPageUrl } = require("../../config/siteUrls");
const { DateTime } = require("luxon");
const { intToWords, moneyWords, unitWords } = require("./propertyVoicePromptBuilder");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");

const LIVE_FILTER = {
  showOnAuctions: true,
  isTestProperty: { $ne: true },
  status: { $nin: ["sold", "cancelled"] },
};

const PROJECTION = {
  productName: 1, street: 1, city: 1, county: 1, state: 1, zipCode: 1,
  beds: 1, baths: 1, squareFootage: 1, propertyType: 1, assetType: 1,
  occupancyStatus: 1, startBid: 1, currentBid: 1, onlineOrInPerson: 1,
  auctionStartDate: 1, auctionEndDate: 1, slug: 1, status: 1,
  "investmentData.valuation.ViharaValue": 1,
};

const CACHE_TTL_MS = Number(process.env.MAYA_LISTINGS_CACHE_MS || 2 * 60 * 1000);
const MAX_RESULTS = 3;
const PRELOAD_RESULTS = 3;

// ── US states ────────────────────────────────────────────────────────────────
const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** "GA", "ga", "Georgia", "georgia " → "GA"; anything else → "". */
function stateCode(input) {
  const s = norm(input);
  if (!s) return "";
  if (s.length === 2 && STATES[s.toUpperCase()]) return s.toUpperCase();
  return STATE_BY_NAME[s] || "";
}

const stateName = (code) => STATES[code] || code;

// Spoken property types ("house", "condo", "duplex", "lot") → the model's enum.
const TYPE_ALIASES = [
  [/condo|town ?home|townhouse|apartment|unit/, "Condo, Townhouse, other single unit"],
  [/multi|duplex|triplex|fourplex|plex|apartment building/, "Multi-family"],
  [/land|lot|acre/, "Land"],
  [/single|house|home|detached/, "Single Family"],
];
function propertyTypeFor(input) {
  const s = norm(input);
  if (!s) return "";
  for (const [re, type] of TYPE_ALIASES) if (re.test(s)) return type;
  return "";
}

// "$300k", "300,000", "1.2m", "three hundred thousand" isn't parsed (the LLM sends numbers).
function parseMoney(input) {
  if (typeof input === "number") return input > 0 ? input : 0;
  const m = String(input || "").toLowerCase().replace(/[$,\s]/g, "").match(/(\d+(?:\.\d+)?)(k|m|mm)?/);
  if (!m) return 0;
  const n = parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] ? 1e6 : 1);
  return n > 0 ? Math.round(n) : 0;
}

// ── Live listings cache ──────────────────────────────────────────────────────
let cache = null; // { at, listings }

async function getLiveListings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.listings;
  const listings = await productModel.find(LIVE_FILTER).select(PROJECTION).lean();
  cache = { at: Date.now(), listings };
  return listings;
}

function clearListingsCache() {
  cache = null;
}

// Price a buyer compares with: the current bid once bidding has moved, else the starting bid.
const askingPrice = (p) => (p.currentBid > 0 && p.currentBid > (p.startBid || 0) ? p.currentBid : p.startBid || 0);

// ── Search ───────────────────────────────────────────────────────────────────
/**
 * Pure search over an array of listings (the cache, or a fixture in tests).
 *
 * @param {object[]} listings
 * @param {object} q { city, state, zipCode, maxPrice, minPrice, minBeds, minBaths, propertyType }
 * @param {Date} now
 * @returns {{ matches: object[], total: number, scope: string, relaxed: string[], areaFound: boolean }}
 *   scope: "zip" | "city" | "state" | "any" — how wide the location match ended up
 *   relaxed: filters dropped because nothing matched with them (e.g. ["price"])
 *   areaFound: false when the asked-for area has no live listings at all
 */
function searchListings(listings, q = {}, now = new Date()) {
  const zip = String(q.zipCode || "").replace(/\D/g, "").slice(0, 5);
  const city = norm(q.city).replace(/ county$/, "");
  let state = stateCode(q.state);
  const maxPrice = parseMoney(q.maxPrice);
  const minPrice = parseMoney(q.minPrice);
  const minBeds = Number(q.minBeds) > 0 ? Number(q.minBeds) : 0;
  const minBaths = Number(q.minBaths) > 0 ? Number(q.minBaths) : 0;
  const type = propertyTypeFor(q.propertyType);

  const inCity = (p) => norm(p.city) === city || norm(p.county).replace(/ county$/, "") === city;
  // A city with no state: borrow the state from any listing in that city.
  if (city && !state) {
    const hit = listings.find(inCity);
    if (hit) state = stateCode(hit.state);
  }
  const inState = (p) => stateCode(p.state) === state;

  // Location tiers, narrowest first; fall back to the next one only when empty.
  const tiers = [];
  if (zip) tiers.push(["zip", (p) => String(p.zipCode || "").slice(0, 5) === zip]);
  if (city) tiers.push(["city", (p) => inCity(p) && (!state || inState(p))]);
  if (state) tiers.push(["state", inState]);
  if (!tiers.length) tiers.push(["any", () => true]);

  let scope = tiers[0][0];
  let pool = [];
  for (const [name, test] of tiers) {
    pool = listings.filter(test);
    scope = name;
    if (pool.length) break;
  }
  const areaFound = pool.length > 0;

  const filters = [
    ["type", (p) => !type || p.propertyType === type],
    ["bedrooms", (p) => !minBeds || (p.beds || 0) >= minBeds],
    ["bathrooms", (p) => !minBaths || (p.baths || 0) >= minBaths],
    ["price", (p) => (!maxPrice || askingPrice(p) <= maxPrice) && (!minPrice || askingPrice(p) >= minPrice)],
  ];

  // Apply every filter; if that leaves nothing, drop the softest one at a time
  // (price first, then baths, beds, type) so Maya can say "nothing under 300k,
  // the closest is…" instead of a dead end.
  const relaxed = [];
  let active = filters.slice();
  let matches = pool.filter((p) => active.every(([, f]) => f(p)));
  const dropOrder = ["price", "bathrooms", "bedrooms", "type"];
  for (const name of dropOrder) {
    if (matches.length || !pool.length) break;
    active = active.filter(([n]) => n !== name);
    relaxed.push(name);
    matches = pool.filter((p) => active.every(([, f]) => f(p)));
  }

  const t = now.getTime();
  const rank = (p) => {
    const start = p.auctionStartDate ? new Date(p.auctionStartDate).getTime() : NaN;
    const end = p.auctionEndDate ? new Date(p.auctionEndDate).getTime() : NaN;
    if (end >= t && start <= t) return 0; // bidding open now
    if (start > t) return 1; // coming up
    return 2; // no date yet / round ended (a new round gets scheduled)
  };
  const soonest = (p) => {
    const d = new Date(p.auctionStartDate || p.auctionEndDate || 0).getTime();
    return Number.isFinite(d) && d > 0 ? d : Infinity;
  };
  matches.sort((a, b) => rank(a) - rank(b) || soonest(a) - soonest(b) || askingPrice(a) - askingPrice(b));

  // When the price filter was dropped, show the cheapest first: that's the "closest" fit.
  if (relaxed.includes("price") && maxPrice) matches.sort((a, b) => askingPrice(a) - askingPrice(b));

  return { matches, total: matches.length, scope, relaxed, areaFound };
}

// ── Spoken formatting ────────────────────────────────────────────────────────
const TYPE_SPOKEN = {
  "Single Family": "single-family home",
  "Condo, Townhouse, other single unit": "condo or townhome",
  "Multi-family": "multi-family property",
  Land: "piece of land",
};

// The auction day as the property's own calendar shows it ("Friday, November 20").
const dayWords = (d, p) =>
  DateTime.fromJSDate(new Date(d)).setZone(resolvePropertyTimezone(p)).toFormat("cccc, LLLL d");

function auctionWords(p, now = new Date()) {
  const start = p.auctionStartDate ? new Date(p.auctionStartDate) : null;
  const end = p.auctionEndDate ? new Date(p.auctionEndDate) : null;
  const where = p.onlineOrInPerson === "In Person" ? "in-person auction" : "online auction";
  if (start && end && start <= now && end >= now) return `${where} is open for bidding now, ends ${dayWords(end, p)}`;
  if (start && start > now) return `${where} on ${dayWords(start, p)}`;
  return `${where} date is being set, the team can confirm it`;
}

/** One listing as a single spoken-ready line for Maya. */
function describeListing(p, now = new Date()) {
  const parts = [];
  const place = [p.street, p.city, stateName(stateCode(p.state)) || p.state].filter(Boolean).join(", ");
  const kind = TYPE_SPOKEN[p.propertyType] || "property";
  const size = p.propertyType === "Land" ? "" : [p.beds ? `${unitWords(p.beds)} bed` : "", p.baths ? `${unitWords(p.baths)} bath` : ""].filter(Boolean).join(", ");
  parts.push(`${place}: ${size ? `${size} ` : ""}${kind}`);
  if (p.occupancyStatus) parts.push(p.occupancyStatus.toLowerCase());
  const price = askingPrice(p);
  const bidMoved = p.currentBid > 0 && p.currentBid > (p.startBid || 0);
  if (price) parts.push(`${bidMoved ? "current bid" : "starting bid"} ${moneyWords(price)}`);
  const value = p.investmentData?.valuation?.ViharaValue;
  if (value > 0) parts.push(`Vihara's value estimate ${moneyWords(value)}`);
  parts.push(auctionWords(p, now));
  if (p.slug) parts.push(`page: ${listingPageUrl(p.slug).replace(/^https?:\/\/(www\.)?/, "")}`);
  return parts.join("; ");
}

const FILTER_WORDS = { price: "that price range", bedrooms: "that many bedrooms", bathrooms: "that many bathrooms", type: "that type of property" };

function areaLabel(q) {
  const code = stateCode(q.state);
  return [q.city, code ? stateName(code) : q.state, q.zipCode].filter(Boolean).join(", ") || "anywhere";
}

/** Tool result text Maya reads before she answers. Plain text, short. */
function formatToolResult(result, q = {}, allListings = [], now = new Date()) {
  const lines = [];
  if (!allListings.length) {
    return "NO LIVE LISTINGS right now on Vihara. Tell the caller new homes are added regularly and offer to book a call with the team (scheduleCallback) to talk about what they want.";
  }
  if (!result.areaFound) {
    lines.push(`NO LIVE LISTINGS in ${areaLabel(q)} right now.`);
    lines.push(`Where Vihara has live listings: ${stateSummary(allListings)}.`);
    lines.push("Say so plainly, mention where we do have homes only if it helps, and offer to book a call with the team (scheduleCallback) to talk about what they want.");
    return lines.join("\n");
  }
  const shown = result.matches.slice(0, MAX_RESULTS);
  // The exact area had nothing, so the search widened: say where these really are.
  let widened = "";
  if (result.scope === "state" && (q.city || q.zipCode)) {
    widened = ` Nothing in ${q.city || `zip ${q.zipCode}`} itself; these are elsewhere in ${stateName(stateCode(shown[0]?.state))}.`;
  } else if (result.scope === "city" && q.zipCode) {
    widened = ` Nothing in zip ${q.zipCode} itself; these are elsewhere in ${shown[0]?.city}.`;
  }
  if (result.relaxed.length) {
    lines.push(
      `NO EXACT MATCH for ${result.relaxed.map((r) => FILTER_WORDS[r]).join(" or ")} in ${areaLabel(q)}. Closest live listings instead (say that clearly):${widened}`
    );
  } else {
    lines.push(`${result.total} live listing${result.total === 1 ? "" : "s"} match${result.total === 1 ? "es" : ""}.${widened}${result.total > shown.length ? ` Showing the top ${shown.length}.` : ""}`);
  }
  shown.forEach((p, i) => lines.push(`${i + 1}. ${describeListing(p, now)}`));
  lines.push("Tell the caller about one or two of these in a sentence each, then ask if they want more detail.");
  return lines.join("\n");
}

/** "California (12), Texas (5), Georgia (2)" — top states by live count. */
function stateSummary(listings, max = 8) {
  const counts = new Map();
  for (const p of listings) {
    const code = stateCode(p.state) || String(p.state || "").trim();
    if (code) counts.set(code, (counts.get(code) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, max).map(([c, n]) => `${stateName(c)} (${n})`);
  if (sorted.length > max) top.push(`and ${sorted.length - max} more states`);
  return top.join(", ");
}

// ── Tool entry point ─────────────────────────────────────────────────────────
async function runFindListingsTool(args = {}) {
  const listings = await getLiveListings();
  const result = searchListings(listings, args);
  return formatToolResult(result, args, listings);
}

// ── Pre-call context ─────────────────────────────────────────────────────────
// Turn the lead's form answers into areas to search: "Dallas, TX and Kingwood, TX",
// "Sacramento; Roseville", or their own city/state as a last resort.
function areasFromPerson(person = {}) {
  const raw = [person.market, person.where].filter(Boolean).join(" ; ");
  const areas = [];
  for (const part of raw.split(/\band\b|;|\||\/|\n/i)) {
    const bits = part.split(",").map((s) => s.trim()).filter(Boolean);
    if (!bits.length) continue;
    const last = bits[bits.length - 1];
    const code = stateCode(last);
    if (code && bits.length >= 2) areas.push({ city: bits[bits.length - 2], state: code });
    else if (code) areas.push({ state: code });
    else areas.push({ city: bits[0], state: stateCode(person.state) || "" });
  }
  if (!areas.length && (person.city || person.state)) areas.push({ city: person.city || "", state: stateCode(person.state) || person.state || "" });
  return areas.slice(0, 4);
}

// Budget / deal size → the top of the range ("250k-500k" → 500000).
function maxBudgetFromPerson(person = {}) {
  const raw = String(person.budget || person.dealSize || "");
  const nums = (raw.toLowerCase().replace(/,/g, "").match(/\d+(?:\.\d+)?\s*(k|m)?/g) || []).map(parseMoney).filter((n) => n >= 10000);
  return nums.length ? Math.max(...nums) : 0;
}

const minBedsFromPerson = (person = {}) => {
  const m = String(person.bedrooms || "").match(/\d+/);
  return m ? Number(m[0]) : 0;
};

/**
 * System-prompt block with the live inventory at a glance + the homes that fit
 * this lead. Never throws: on any error returns "" and the call goes out without it.
 */
async function buildListingsContext(person = {}, now = new Date()) {
  try {
    const listings = await getLiveListings();
    if (!listings.length) {
      return "There are no live listings on Vihara at this moment. If asked, say new homes are added regularly.";
    }
    const lines = [`Right now there are ${intToWords(listings.length)} live listings on Vihara, in: ${stateSummary(listings)}.`];

    const maxPrice = maxBudgetFromPerson(person);
    const minBeds = minBedsFromPerson(person);
    const seen = new Set();
    const picks = [];
    for (const area of areasFromPerson(person)) {
      const r = searchListings(listings, { ...area, maxPrice, minBeds }, now);
      if (!r.areaFound || r.relaxed.length) continue; // only real fits go in the prompt
      for (const p of r.matches) {
        const id = String(p._id);
        if (seen.has(id)) continue;
        seen.add(id);
        picks.push(p);
        if (picks.length >= PRELOAD_RESULTS) break;
      }
      if (picks.length >= PRELOAD_RESULTS) break;
    }
    if (picks.length) {
      lines.push("Live listings that fit what this caller told us on the form (bring one up only if it fits the conversation):");
      picks.forEach((p, i) => lines.push(`${i + 1}. ${describeListing(p, now)}`));
    }
    return lines.join("\n");
  } catch (err) {
    console.error("[listings] buildListingsContext failed (non-fatal):", err.message);
    return "";
  }
}

module.exports = {
  LIVE_FILTER,
  getLiveListings,
  clearListingsCache,
  searchListings,
  formatToolResult,
  describeListing,
  stateSummary,
  runFindListingsTool,
  buildListingsContext,
  areasFromPerson,
  maxBudgetFromPerson,
  stateCode,
  propertyTypeFor,
  parseMoney,
};
