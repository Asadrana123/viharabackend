// services/vtext/vtextListingCatalog.js
//
// Lets the AI text reply answer questions about ANY home we have open for bidding, not only the lead's
// own: "anything else under $200k?", "anything in Baltimore?", "a 4 bedroom in California?".
//
//   the text (+ the last few) ─▶ Gemini: is this a home search, and with which filters? (extractHomeSearch)
//                             ─▶ Mongo: the open homes that match, cheapest first, and how many (searchListings)
//                             ─▶ those few homes, as short lines, go into the reply prompt
//
// Works the same with 14 homes or 5,000: only the matching homes reach the prompt, never the whole list.
// The filter step is told the real towns, counties, states and home types we have, so "near Sacramento"
// or "Texas" turn into values that are actually in the database.
//
// Which homes count as open: the same ones the public site lists (showOnAuctions, not a test property,
// not sold), minus any whose bidding has already closed, so a text never offers a home nobody can bid on.
// What a home's line holds: only public listing facts (address, type, size, starting bid, market estimate,
// rent, auction dates, link). Never the reserve, the current bid, who is bidding or the listing agent,
// the same rule as the knowledge base (rag/propertyChunker.js).
//
// Nothing here throws: a database or Gemini problem gives "no search" and the reply says it will check.
const Product = require("../../model/property/productModel");
const { listingPageUrl } = require("../../config/siteUrls");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { formatAuctionDate } = require("./vtextFormatters");

const INDEX_TTL_MS = 5 * 60_000;
const MAX_SHOWN = Number(process.env.VTEXT_HOME_SEARCH_LIMIT || 10); // homes handed to the reply AI per search
const MAX_NAMED = 3;
const EXTRACT_TIMEOUT_MS = Number(process.env.VTEXT_HOME_SEARCH_TIMEOUT_MS || 8000);
const HISTORY_FOR_EXTRACT = 4;

// Everything a home's line shows. The search itself filters on a few of these.
const FIELDS =
  "productName slug street city county state zipCode beds baths propertyType assetType squareFootage yearBuilt occupancyStatus startBid auctionStartDate auctionEndDate investmentData.valuation.ViharaValue investmentData.rental.estimatedMonthlyRent";
const INDEX_FIELDS = "slug street city county state propertyType";

const isEnabled = () => process.env.VTEXT_RAG_CATALOG !== "false"; // on with the knowledge lookup unless switched off on its own

const money = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? `$${Math.round(n).toLocaleString("en-US")}` : "");
const num = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Open for bidding: listed on the site, not a test, not sold, bidding not closed (no end date counts as open). */
function openQuery(now = new Date()) {
  return {
    showOnAuctions: true,
    isTestProperty: { $ne: true },
    status: { $ne: "sold" },
    slug: { $type: "string", $ne: "" },
    $or: [{ auctionEndDate: { $exists: false } }, { auctionEndDate: null }, { auctionEndDate: { $gt: now } }],
  };
}

/** One home as the AI sees it. */
function toListing(p) {
  const tz = resolvePropertyTimezone(p);
  const parts = [];
  const where = [p.street, p.city, p.county ? `${p.county} County` : "", p.state].filter(Boolean).join(", ");
  parts.push(where || p.productName || p.slug);

  const type = p.propertyType || p.assetType || "";
  const size = [
    num(p.beds) ? `${p.beds} bed` : "",
    num(p.baths) ? `${p.baths} bath` : "",
    num(p.squareFootage) ? `${Math.round(p.squareFootage).toLocaleString("en-US")} sq ft` : "",
  ].filter(Boolean).join(", ");
  if (type || size) parts.push([type, size].filter(Boolean).join(", "));
  if (num(p.yearBuilt)) parts.push(`built ${p.yearBuilt}`);
  if (p.occupancyStatus) parts.push(String(p.occupancyStatus).toLowerCase());
  if (money(p.startBid)) parts.push(`starting bid ${money(p.startBid)}`);
  const estimate = p.investmentData?.valuation?.ViharaValue;
  if (money(estimate)) parts.push(`market estimate ${money(estimate)}`);
  const rent = p.investmentData?.rental?.estimatedMonthlyRent;
  if (money(rent)) parts.push(`rent estimate ${money(rent)} a month`);
  const opens = formatAuctionDate(p.auctionStartDate, tz);
  const closes = formatAuctionDate(p.auctionEndDate, tz);
  if (opens && closes && opens !== closes) parts.push(`bidding ${opens} to ${closes}`);
  else if (opens || closes) parts.push(`auction ${opens || closes}`);
  if (p.slug) parts.push(listingPageUrl(p.slug));

  return { slug: String(p.slug || "").toLowerCase(), name: p.productName || p.street || p.slug, line: parts.join(" | ") };
}

/** The lines as prompt text. */
function formatCatalog(listings) {
  return (listings || []).map((l) => `- ${l.line}`).join("\n");
}

// ── The light index: every open home's address only, for spotting a named home and for the filter
//    step's list of towns, counties, states and types. Small even with thousands of homes. Cached.
let indexCache = null; // { at, homes, facets }

function facetsOf(homes) {
  const uniq = (key) => [...new Set(homes.map((h) => String(h[key] || "").trim()).filter(Boolean))].sort();
  return { cities: uniq("city"), counties: uniq("county"), states: uniq("state"), propertyTypes: uniq("propertyType") };
}

/** @returns {Promise<{ homes: Array<{slug,street,city,county,state,propertyType}>, facets: object }>} */
async function loadOpenIndex({ now = new Date() } = {}) {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache;
  try {
    const docs = await Product.find(openQuery(now)).select(INDEX_FIELDS).lean();
    const homes = docs.map((d) => ({ ...d, slug: String(d.slug).toLowerCase() }));
    indexCache = { at: Date.now(), homes, facets: facetsOf(homes) };
    return indexCache;
  } catch (err) {
    console.error("[vtext catalog] could not load the open homes:", err.message);
    return indexCache || { homes: [], facets: facetsOf([]) };
  }
}

// ── Step 1: is this a home search, and with which filters?

/** Turns the model's answer into filters that only use values we really have. Pure. */
function cleanFilters(raw, facets) {
  if (!raw || typeof raw !== "object" || raw.asksAboutHomes !== true) return null;
  const pick = (values, allowed) => {
    const byLower = new Map((allowed || []).map((a) => [a.toLowerCase(), a]));
    return [...new Set((Array.isArray(values) ? values : []).map((v) => byLower.get(String(v).trim().toLowerCase())).filter(Boolean))];
  };
  const positive = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const f = {
    maxPrice: positive(raw.maxPrice),
    minPrice: positive(raw.minPrice),
    cities: pick(raw.cities, facets.cities),
    counties: pick(raw.counties, facets.counties),
    states: pick(raw.states, facets.states),
    minBeds: positive(raw.minBeds),
    minBaths: positive(raw.minBaths),
    propertyTypes: pick(raw.propertyTypes, facets.propertyTypes),
    occupancy: raw.occupancy === "vacant" || raw.occupancy === "occupied" ? raw.occupancy : null,
    sort: raw.sort === "price_desc" ? "price_desc" : "price_asc",
    // A place they named that we have no home in ("anything in Denver?") - kept so the reply can say so.
    unmatchedPlace: typeof raw.unmatchedPlace === "string" ? raw.unmatchedPlace.trim().slice(0, 60) : "",
  };
  if (f.minPrice && f.maxPrice && f.minPrice > f.maxPrice) [f.minPrice, f.maxPrice] = [f.maxPrice, f.minPrice];
  return f;
}

function buildExtractPrompt({ messages, replyToBody, facets, ownPlace = "" }) {
  const recent = (messages || []).slice(0, -1).slice(-HISTORY_FOR_EXTRACT)
    .map((m) => `${m.direction === "in" ? "Contact" : "Us"}: ${m.body}`).join("\n");
  return `A contact is texting a real-estate auction company. Decide whether their LAST message asks which homes we have for sale (other homes, homes under or over a price, in a place, with some number of bedrooms, of some type, "anything else?", "send me more", "what about <place>"). Questions only about one specific home's details (its taxes, its address, is it vacant) are NOT a home search.

If it is a home search, give the filters they want.
- Earlier messages count ONLY when the last message is a follow-up that adds to or changes the last search: "what about New Orleans" or "and in Texas?" after "anything under 200k?" keeps the 200k limit and changes the place; "with 3 bedrooms?" adds bedrooms; "send the rest" or "any more?" repeats the last search. A new thing of the same kind replaces the old one (a new place replaces the old place, a new price the old price).
- A message that is a full question of its own ("do you have a 4 bedroom in California?", "anything under 20k?", "anything in Denver?", "anything in Texas?", "do you have condos?") is a NEW search: use only what that message asks, nothing from earlier searches. Only a message worded as a follow-up ("what about...", "and...", "with...", "also...", "how about...", "more", "the rest", "cheaper ones?") keeps earlier filters.
- A home type only when they ask for one by name (condo, townhouse, multi-family, duplex, land, mobile home), mapped to the listed home type that contains it (for example "condo" or "townhouse" to the type with Condo or Townhouse in it, "duplex" to Multi-family). "House", "home", "place", "property" or "something" means any type: leave propertyTypes empty.
- A place from an earlier message that is not in the lists (an earlier unmatchedPlace) is never carried into a follow-up.
Pick places and types ONLY from these lists (copy the spelling exactly). A nearby or wider area maps to the places in the list that are in it (for example a state name to its state value, "Bay Area" to the Bay Area towns listed). If they name a place with nothing in the lists near it, leave the place filters empty and put their words in unmatchedPlace.
States: ${facets.states.join(", ") || "(none)"}
Counties: ${facets.counties.join(", ") || "(none)"}
Towns: ${facets.cities.join(", ") || "(none)"}
Home types: ${facets.propertyTypes.join(", ") || "(none)"}
${ownPlace ? `\nThe home they signed up for is in ${ownPlace}. "The area", "nearby", "around here", "close by" or "near me" means that town (put the town in cities).\n` : ""}
${recent ? `Earlier messages (oldest first):\n${recent}\n\n` : ""}Last message:
<<<
${replyToBody}
>>>

Reply with JSON only:
{"asksAboutHomes": true or false, "maxPrice": number or null, "minPrice": number or null, "states": [], "counties": [], "cities": [], "minBeds": number or null, "minBaths": number or null, "propertyTypes": [], "occupancy": "vacant" or "occupied" or null, "sort": "price_asc" or "price_desc", "unmatchedPlace": ""}
Prices are whole dollars ("200k" = 200000, "1.2 million" = 1200000). "Under" or "below" is maxPrice, "over" or "above" is minPrice. "Most expensive" or "biggest budget" is price_desc, otherwise price_asc.`;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @returns {Promise<{ ok: boolean, filters: object|null, error?: string }>} ok=false when the step failed
 *   (Gemini down, slow, bad JSON); filters=null when it worked and this is not a home search.
 */
async function extractHomeSearch({ messages, replyToBody, facets, ownPlace = "" }) {
  const text = String(replyToBody || "").trim();
  if (!text) return { ok: true, filters: null };
  try {
    const { getClient, MODEL_NAME } = require("./vtextAiReplyService"); // lazy: that file requires this one's users
    const client = getClient();
    if (!client) return { ok: false, filters: null, error: "no Gemini key" };
    const model = client.getGenerativeModel({ model: MODEL_NAME });
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: buildExtractPrompt({ messages, replyToBody: text, facets, ownPlace }) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      }),
      EXTRACT_TIMEOUT_MS,
      "home search filters"
    );
    require("../usage/spendRecorder").recordGemini("vtext-home-search", MODEL_NAME, result);
    const raw = JSON.parse(String(result?.response?.text() || "").replace(/```(?:json)?/g, "").trim());
    return { ok: true, filters: cleanFilters(raw, facets) };
  } catch (err) {
    console.warn("[vtext catalog] could not read the home search from the message:", err.message);
    return { ok: false, filters: null, error: err.message };
  }
}

// ── Step 2: the matching homes from Mongo.

const hasPlace = (f) => Boolean(f.cities.length || f.counties.length || f.states.length);

/** They named only a place we have no homes in ("anything in Denver?"): nothing can match exactly. */
const onlyUnknownPlace = (f) => Boolean(f.unmatchedPlace) && !hasPlace(f);

/** The Mongo query for these filters. Pure. `drop` leaves out the price ("price"), the place ("place") or every filter ("all"). */
function buildListingQuery(filters, { now = new Date(), excludeSlugs = [], drop = "" } = {}) {
  const q = openQuery(now);
  const and = [];
  if (excludeSlugs.length) q.slug = { ...q.slug, $nin: excludeSlugs };
  if (drop !== "all") {
    if (drop !== "price" && (filters.maxPrice || filters.minPrice)) {
      q.startBid = { ...(filters.minPrice ? { $gte: filters.minPrice } : {}), ...(filters.maxPrice ? { $lte: filters.maxPrice } : {}) };
    }
    const places = [];
    if (drop !== "place") {
      if (filters.cities.length) places.push({ city: { $in: filters.cities } });
      if (filters.counties.length) places.push({ county: { $in: filters.counties } });
      if (filters.states.length) places.push({ state: { $in: filters.states } });
    }
    if (places.length) and.push({ $or: places });
    if (filters.minBeds) q.beds = { $gte: filters.minBeds };
    if (filters.minBaths) q.baths = { $gte: filters.minBaths };
    if (filters.propertyTypes.length) q.propertyType = { $in: filters.propertyTypes };
    if (filters.occupancy) q.occupancyStatus = { $regex: `^${escapeRegex(filters.occupancy)}`, $options: "i" };
  }
  if (and.length) q.$and = and;
  return q;
}

/** What was asked, in words, for the prompt ("under $200,000, in Baltimore, 3+ bedrooms"). Pure. */
function describeFilters(f) {
  const parts = [];
  if (f.minPrice && f.maxPrice) parts.push(`starting bid ${money(f.minPrice)} to ${money(f.maxPrice)}`);
  else if (f.maxPrice) parts.push(`starting bid up to ${money(f.maxPrice)}`);
  else if (f.minPrice) parts.push(`starting bid ${money(f.minPrice)} or more`);
  const places = [...f.cities, ...f.counties.map((c) => `${c} County`), ...f.states];
  if (places.length) parts.push(`in ${places.join(" or ")}`);
  if (f.unmatchedPlace) parts.push(`in ${f.unmatchedPlace} (we have no homes there)`);
  if (f.minBeds) parts.push(`${f.minBeds}+ bedrooms`);
  if (f.minBaths) parts.push(`${f.minBaths}+ bathrooms`);
  if (f.propertyTypes.length) parts.push(f.propertyTypes.join(" or "));
  if (f.occupancy) parts.push(f.occupancy);
  return parts.join(", ") || "any home";
}

/**
 * The states of the towns and counties they asked about, from the open-home index (the lead's own home
 * included, so "anything else in Baltimore?" still knows Baltimore is in MD). Pure.
 * @param {object} filters
 * @param {Array<{city, county, state}>} homes
 * @returns {string[]}
 */
function statesNear(filters, homes) {
  if (!filters || (!filters.cities.length && !filters.counties.length)) return [];
  const lower = (list) => new Set(list.map((v) => String(v).toLowerCase()));
  const cities = lower(filters.cities);
  const counties = lower(filters.counties);
  const states = (homes || [])
    .filter((h) => cities.has(String(h.city || "").toLowerCase()) || counties.has(String(h.county || "").toLowerCase()))
    .map((h) => String(h.state || "").trim())
    .filter(Boolean);
  return [...new Set(states)];
}

/** The same search, widened from the towns/counties asked to their whole state. null when that adds nothing. Pure. */
function nearbyFilters(filters, nearStates) {
  if (!filters.cities.length && !filters.counties.length) return null;
  const extra = (nearStates || []).filter((s) => !filters.states.includes(s));
  if (!extra.length) return null;
  return { ...filters, cities: [], counties: [], states: [...filters.states, ...extra] };
}

const PROJECTION = Object.fromEntries(FIELDS.split(" ").map((f) => [f, 1]));

/**
 * The open homes matching the filters (the lead's own left out), cheapest first unless asked otherwise.
 * None match: nearby first, then something rather than nothing, marked `relaxed` so the reply can say how they differ:
 *   1. the same search in the whole state of the town they asked about ("state")
 *   2. with a price: the place they asked, any price ("price"), then the whole state, any price ("state_price")
 *      (when they named only a place we have no homes in: the same search anywhere else, "place")
 *   3. any open home, closest in starting bid to the price they gave or to their own home ("all")
 * @param {object} filters
 * @param {{ now?: Date, excludeSlugs?: string[], limit?: number, nearStates?: string[], anchorBid?: number|null }} opts
 *   nearStates: from statesNear(); anchorBid: the starting bid of the lead's own home
 * @returns {Promise<{ total: number, listings: object[], relaxed: ""|"state"|"price"|"state_price"|"place"|"all" }>}
 */
async function searchListings(filters, { now = new Date(), excludeSlugs = [], limit = MAX_SHOWN, nearStates = [], anchorBid = null } = {}) {
  const sort = filters.sort === "price_desc" ? { startBid: -1, slug: 1 } : { startBid: 1, slug: 1 };
  const run = async (f, drop) => {
    const q = buildListingQuery(f, { now, excludeSlugs, drop });
    const [total, docs] = await Promise.all([Product.countDocuments(q), Product.find(q).select(FIELDS).sort(sort).limit(limit).lean()]);
    return { total, listings: docs.map(toListing) };
  };
  const closest = (r, relaxed) => ({ total: 0, listings: r.listings.slice(0, MAX_NAMED), relaxed });
  const hasPrice = Boolean(filters.maxPrice || filters.minPrice);

  if (onlyUnknownPlace(filters)) {
    const elsewhere = await run(filters, "place");
    if (elsewhere.total) return closest(elsewhere, "place");
  } else {
    const exact = await run(filters, "");
    if (exact.total) return { ...exact, relaxed: "" };
    const near = nearbyFilters(filters, nearStates);
    if (near) {
      const inState = await run(near, "");
      if (inState.total) return closest(inState, "state");
    }
    if (hasPrice) {
      const noPrice = await run(filters, "price");
      if (noPrice.total) return closest(noPrice, "price");
      if (near) {
        const inStateNoPrice = await run(near, "price");
        if (inStateNoPrice.total) return closest(inStateNoPrice, "state_price");
      }
    }
  }

  // Nothing nearby: still offer something, the homes closest in starting bid to what they are looking at.
  const anchor = filters.maxPrice || filters.minPrice || num(anchorBid);
  const q = buildListingQuery(filters, { now, excludeSlugs, drop: "all" });
  const docs = anchor
    ? await Product.aggregate([
        { $match: q },
        { $addFields: { _gap: { $abs: { $subtract: [{ $ifNull: ["$startBid", 0] }, anchor] } } } },
        { $sort: { _gap: 1, slug: 1 } },
        { $limit: MAX_NAMED },
        { $project: PROJECTION },
      ])
    : await Product.find(q).select(FIELDS).sort(sort).limit(MAX_NAMED).lean();
  return { total: 0, listings: docs.map(toListing), relaxed: docs.length ? "all" : "" };
}

/** The lines for homes the message named (open homes only). */
async function loadListingsBySlugs(slugs, { now = new Date() } = {}) {
  if (!slugs?.length) return [];
  try {
    const docs = await Product.find({ ...openQuery(now), slug: { $in: slugs } }).select(FIELDS).lean();
    return docs.map(toListing);
  } catch (err) {
    console.error("[vtext catalog] could not load the named homes:", err.message);
    return [];
  }
}

// ── A home named in the message ("taxes on the Baltimore one?", "tell me about Monument St").

// Words that say nothing about which home is meant ("st", "ave", "the", a direction).
const STREET_NOISE = new Set(["st", "street", "ave", "avenue", "rd", "road", "dr", "drive", "ln", "lane", "way", "blvd", "boulevard", "ct", "court", "pl", "place", "hwy", "highway", "state", "n", "s", "e", "w", "the", "of"]);
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/**
 * The homes a message names, so their details can be looked up too. A street matches on its name (house
 * number and "St"/"Ave" left out, and only a name of 4+ letters, so "10th" or "Law" alone does not match).
 * A town matches only when 2 or fewer open homes are in it, otherwise the message does not say which.
 * @param {string} text - the message, plus the rewritten question when it is a follow-up
 * @param {Array<{slug, street, city}>} homes
 * @returns {string[]} slugs, at most `max`
 */
function findMentionedSlugs(text, homes, max = MAX_NAMED) {
  const said = ` ${words(text).join(" ")} `;
  if (!said.trim()) return [];
  const found = [];
  const add = (slug) => {
    if (slug && !found.includes(slug) && found.length < max) found.push(slug);
  };

  for (const h of homes || []) {
    const name = words(h.street).filter((w) => !/^\d/.test(w) && !STREET_NOISE.has(w));
    if (name.length && name.join("").length >= 4 && said.includes(` ${name.join(" ")} `)) add(h.slug);
  }

  const byCity = new Map();
  for (const h of homes || []) {
    const city = words(h.city).join(" ");
    if (!city) continue;
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(h.slug);
  }
  for (const [city, slugs] of byCity) {
    if (slugs.length <= 2 && said.includes(` ${city} `)) slugs.forEach(add);
  }
  return found;
}

/** Tests only. */
function clearCache() {
  indexCache = null;
}

module.exports = {
  isEnabled,
  loadOpenIndex,
  extractHomeSearch,
  cleanFilters,
  buildExtractPrompt,
  buildListingQuery,
  describeFilters,
  statesNear,
  nearbyFilters,
  searchListings,
  loadListingsBySlugs,
  findMentionedSlugs,
  formatCatalog,
  toListing,
  openQuery,
  clearCache,
};
