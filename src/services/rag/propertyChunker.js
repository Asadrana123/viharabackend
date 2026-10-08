// services/rag/propertyChunker.js
//
// Turns ONE property document (productModel, a plain object from .lean()) into a
// set of topic chunks ready for embedding. This is the foundation of the RAG
// knowledge base: each chunk is a small, natural-language paragraph about ONE
// topic (schools, taxes, HOA, …), so a caller's question — "is it near good
// schools?" — retrieves the schools chunk and nothing else.
//
// ── DESIGN RULES (do not weaken without a review) ─────────────────────────────
//
//   1. SAFETY — the BLOCKED_FIELDS list is NEVER embedded. reservePrice is the
//      critical one: it is the confidential floor price. Enforcement is
//      STRUCTURAL (the topic builders below only ever read allowed fields) AND
//      DEFENDED by a final guard that drops any chunk whose text somehow contains
//      the reserve price or live bid value.
//
//   2. NEVER INVENT — chunks are built only from values that exist in the doc.
//      Nothing is inferred, defaulted, or filled in. Missing data stays missing;
//      Maya then simply says she doesn't have it.
//
//   3. NULLS ARE SKIPPED, NOT FILLED — a null / undefined / "" value is dropped
//      silently (no "N/A", no placeholder). A real 0 is KEPT (e.g. $0 HOA dues is
//      a fact). If a whole topic has no data, NO chunk is produced for it.
//
//   4. PURE — no DB, no network, no side effects. Property in, chunks out. The
//      sync layer reads Mongo and writes Qdrant; this file is only the transform,
//      so it stays trivially testable and deterministic.
//
// ── OUTPUT ────────────────────────────────────────────────────────────────────
//   An array of chunk objects:
//     { key, topic, text, metadata: { type, propertyId, slug, propertyName, address, topic } }
//   `key` is a stable string ("<slug>:<topic>"). Re-running on the same property
//   yields the same keys, so a re-sync overwrites rather than duplicates. The
//   Qdrant layer converts `key` into its point id (kept out of here on purpose).

'use strict';

// ── The never-embed list (audit record + spec) ────────────────────────────────
// The topic builders never read these, so nothing here can reach a chunk. Listed
// explicitly so the rule is reviewable in one place. Enforced structurally; the
// leak guard at the bottom is the second line of defence for the critical values.
const BLOCKED_FIELDS = [
  // Confidential / business-sensitive
  'reservePrice',            // confidential floor price — the reason this list exists
  'currentBid',              // live auction state
  'currentBidder',           // bidder identity
  'bidderEmails',            // other people's PII
  'sellerIds',               // internal seller references
  'brevoListId',             // internal marketing config
  // Listing-agent private contact (name / company / phone ARE allowed — see builder)
  'listingAgent.email',
  'listingAgent.licenseNumber',
  // Public-record but no value on a call
  'apn',
  'trusteeSaleNumber',
  // Internal / technical — no caller value
  '_id', '__v', 'eventID', 'isTestProperty', 'allowedTestUsers',
  'isLandingPage', 'showOnAuctions', 'featured', 'status',
  'threeDTourId', 'threeDTourMetadata', 'image', 'otherImages',
  'coordinates', 'slug', 'createdAt', 'updatedAt', 'auctionEventLabel',
  'availableAreas',
];

// ── Value helpers — the null rules live here ──────────────────────────────────

// Present = not null/undefined and not an empty/whitespace string. A real 0 or
// false counts as PRESENT (0 HOA dues is a fact worth stating).
const has = (v) =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');

// Keep only present values from a string list, trimmed.
const clean = (a) =>
  (Array.isArray(a) ? a : []).filter(has).map((s) => String(s).trim());

// Join present string-array entries into a natural clause ("a, b, c").
const list = (a) => clean(a).join(', ');

// Money → "$1,041,771". Only meaningful when has(n).
const money = (n) => {
  const x = Number(n);
  return Number.isFinite(x)
    ? '$' + x.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '';
};

// Plain number with separators (non-currency), e.g. square footage.
const num = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString('en-US') : '';
};

// Percent → "8%". Accepts 8 or 0.08-style? We assume whole-number percents as
// stored in the schema comments (vacancyRate 8, salesListPrice 101.3).
const pct = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? `${x}%` : '';
};

// Day-level date → "March 15, 2025" (auction dates need the day).
const fullDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? ''
    : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

// Month-level date → "March 2025" (good enough for valuation/eval dates).
const monthYear = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? ''
    : dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// Short address, reused in the basics chunk and in every chunk's metadata.
const addressOf = (p) =>
  [p.street, p.city, p.state, p.zipCode].filter(has).map(String).join(', ');

// Build a chunk only if it ends up with real content; else return null (topic
// skipped). Centralises the "empty topic → no chunk" rule. `parts` is an array
// of sentence fragments; empty/absent fragments are dropped before joining.
const makeChunk = (ctx, topic, parts) => {
  const body = (Array.isArray(parts) ? parts : [parts]).filter(has).join(' ').trim();
  if (!has(body)) return null;
  return {
    key: `${ctx.slug}:${topic}`,
    topic,
    text: body,
    metadata: {
      type: 'property',
      propertyId: ctx.propertyId,
      slug: ctx.slug,
      propertyName: ctx.propertyName,
      address: ctx.address,
      topic,
    },
  };
};

// ── Topic builders ────────────────────────────────────────────────────────────
// Each returns a chunk (via makeChunk) or null. They read ONLY allowed fields.
// Every chunk's text names its own topic so retrieval matches the caller's
// phrasing strongly ("schools" → the schools chunk).

function buildBasics(p, ctx) {
  const bedBath = [
    has(p.beds) ? `${num(p.beds)}-bedroom` : null,
    has(p.baths) ? `${num(p.baths)}-bathroom` : null,
  ].filter(Boolean).join(', ');
  const kind = [p.assetType, p.propertyType].filter(has).join(' ');

  const parts = [];
  if (has(ctx.propertyName)) parts.push(`${ctx.propertyName}.`);
  if (has(ctx.address)) parts.push(`This property is located at ${ctx.address}.`);
  if (has(p.county)) parts.push(`It is in ${p.county} County.`);
  if (bedBath || kind) parts.push(`It is a ${[bedBath, kind].filter(Boolean).join(' ')}.`.replace(' .', '.'));
  if (has(p.occupancyStatus)) parts.push(`Occupancy status: ${p.occupancyStatus}.`);
  if (has(p.squareFootage)) parts.push(`Interior living area is ${num(p.squareFootage)} square feet.`);
  if (has(p.lotSize)) parts.push(`Lot size is ${num(p.lotSize)} square feet.`);
  if (has(p.yearBuilt)) parts.push(`Built in ${p.yearBuilt}.`);
  return makeChunk(ctx, 'basics', parts);
}

function buildAuction(p, ctx) {
  const parts = [];
  if (has(p.startBid)) parts.push(`The auction starting bid is ${money(p.startBid)}.`);
  if (has(p.minIncrement)) parts.push(`The minimum bid increment is ${money(p.minIncrement)}.`);
  if (has(p.emd)) parts.push(`The earnest money deposit (EMD) required is ${money(p.emd)}.`);
  if (has(p.commission)) parts.push(`Buyer's premium / commission is ${money(p.commission)}.`);
  if (has(p.onlineOrInPerson)) parts.push(`The auction is held ${p.onlineOrInPerson}.`);
  if (has(p.auctionStartDate)) parts.push(`The auction starts on ${fullDate(p.auctionStartDate)}.`);
  if (has(p.auctionEndDate)) parts.push(`The auction ends on ${fullDate(p.auctionEndDate)}.`);
  return makeChunk(ctx, 'auction', parts.length ? ['Auction details:', ...parts] : []);
}

function buildDescription(p, ctx) {
  return makeChunk(ctx, 'description', has(p.propertyDescription) ? String(p.propertyDescription).trim() : '');
}

function buildInterior(p, ctx) {
  const i = (p.propertyDetails && p.propertyDetails.interiorDetails) || {};
  const parts = [];
  if (list(i.bedroomsBathrooms)) parts.push(`Bedrooms and bathrooms: ${list(i.bedroomsBathrooms)}.`);
  if (list(i.masterBathroom)) parts.push(`Master bathroom: ${list(i.masterBathroom)}.`);
  if (list(i.rooms)) parts.push(`Rooms: ${list(i.rooms)}.`);
  if (list(i.heating)) parts.push(`Heating: ${list(i.heating)}.`);
  if (list(i.cooling)) parts.push(`Cooling: ${list(i.cooling)}.`);
  if (list(i.interiorFeatures)) parts.push(`Interior features: ${list(i.interiorFeatures)}.`);
  return makeChunk(ctx, 'interior', parts.length ? ['Interior details.', ...parts] : []);
}

function buildExterior(p, ctx) {
  const e = (p.propertyDetails && p.propertyDetails.exteriorDetails) || {};
  const parts = [];
  if (list(e.parking)) parts.push(`Parking: ${list(e.parking)}.`);
  if (list(e.lotFeatures)) parts.push(`Lot features: ${list(e.lotFeatures)}.`);
  if (list(e.exteriorFeatures)) parts.push(`Exterior features: ${list(e.exteriorFeatures)}.`);
  if (list(e.constructionFeatures)) parts.push(`Construction: ${list(e.constructionFeatures)}.`);
  return makeChunk(ctx, 'exterior', parts.length ? ['Exterior details.', ...parts] : []);
}

function buildCommunity(p, ctx) {
  const c = (p.propertyDetails && p.propertyDetails.community) || {};
  const parts = [];
  if (list(c.communityInfo)) parts.push(`Community: ${list(c.communityInfo)}.`);
  if (list(c.hoa)) parts.push(`HOA: ${list(c.hoa)}.`);
  // monthlyHOADues: a real 0 is meaningful ("no monthly HOA dues").
  if (has(p.monthlyHOADues)) {
    parts.push(
      Number(p.monthlyHOADues) === 0
        ? 'There are no monthly HOA dues.'
        : `Monthly HOA dues are ${money(p.monthlyHOADues)}.`
    );
  }
  return makeChunk(ctx, 'community', parts.length ? ['Community and HOA.', ...parts] : []);
}

function buildValuation(p, ctx) {
  const v = (p.investmentData && p.investmentData.valuation) || {};
  const parts = [];
  // NOTE: ViharaValue is the PUBLIC value. reservePrice is NOT read here.
  if (has(v.ViharaValue)) parts.push(`The estimated market value (Vihara Value) is ${money(v.ViharaValue)}.`);
  if (has(v.lowRange) || has(v.highRange)) {
    const lo = has(v.lowRange) ? money(v.lowRange) : null;
    const hi = has(v.highRange) ? money(v.highRange) : null;
    if (lo && hi) parts.push(`The valuation range is ${lo} to ${hi}.`);
    else parts.push(`Valuation ${lo ? `low end ${lo}` : `high end ${hi}`}.`);
  }
  if (has(v.confidenceScore)) parts.push(`Valuation confidence score is ${v.confidenceScore}.`);
  if (has(v.evaluatedDate)) parts.push(`Valued as of ${monthYear(v.evaluatedDate)}.`);
  return makeChunk(ctx, 'valuation', parts.length ? ['Property valuation.', ...parts] : []);
}

function buildRental(p, ctx) {
  const r = (p.investmentData && p.investmentData.rental) || {};
  const parts = [];
  const monthly = has(r.estimatedMonthlyRent) ? r.estimatedMonthlyRent
    : (has(r.rentalValue) ? r.rentalValue : null);
  if (has(monthly)) parts.push(`Estimated monthly rent is ${money(monthly)}.`);
  if (has(r.estimatedAnnualRent)) parts.push(`Estimated annual rent is ${money(r.estimatedAnnualRent)}.`);
  if (has(r.lowRange) || has(r.highRange)) {
    const lo = has(r.lowRange) ? money(r.lowRange) : null;
    const hi = has(r.highRange) ? money(r.highRange) : null;
    if (lo && hi) parts.push(`Rent range is ${lo} to ${hi} per month.`);
  }
  if (has(r.vacancyRate)) parts.push(`Estimated vacancy rate is ${pct(r.vacancyRate)}.`);
  if (has(r.averageRentalTrend)) parts.push(`Average rental trend is ${pct(r.averageRentalTrend)}.`);
  return makeChunk(ctx, 'rental', parts.length ? ['Rental income estimate.', ...parts] : []);
}

function buildTaxes(p, ctx) {
  const t = (p.investmentData && p.investmentData.taxData) || {};
  const parts = [];
  if (has(t.annualPropertyTax)) parts.push(`Annual property tax is ${money(t.annualPropertyTax)}.`);
  if (has(t.assessedValue)) {
    const yr = has(t.assessmentYear) ? ` (${t.assessmentYear})` : '';
    parts.push(`Assessed value${yr} is ${money(t.assessedValue)}.`);
  }
  if (has(t.landValue)) parts.push(`Land value is ${money(t.landValue)}.`);
  if (has(t.improvementValue)) parts.push(`Improvement value is ${money(t.improvementValue)}.`);

  const history = Array.isArray(p.investmentData && p.investmentData.taxHistory)
    ? p.investmentData.taxHistory.filter((h) => h && has(h.year))
    : [];
  if (history.length) {
    const rows = history.slice(0, 4).map((h) => {
      const pieces = [
        has(h.propertyTax) ? `tax ${money(h.propertyTax)}` : null,
        has(h.taxAssessment) ? `assessment ${money(h.taxAssessment)}` : null,
      ].filter(Boolean).join(', ');
      return pieces ? `${h.year}: ${pieces}` : `${h.year}`;
    });
    parts.push(`Recent tax history — ${rows.join('; ')}.`);
  }
  return makeChunk(ctx, 'taxes', parts.length ? ['Property taxes.', ...parts] : []);
}

function buildComparables(p, ctx) {
  const comps = []
    .concat(Array.isArray(p.investmentData && p.investmentData.comparables) ? p.investmentData.comparables : [])
    .concat(Array.isArray(p.comparableMarket) ? p.comparableMarket : [])
    .filter((c) => c && (has(c.address) || has(c.salePrice) || has(c.soldPrice)));
  if (!comps.length) return null;

  const rows = comps.slice(0, 5).map((c) => {
    const price = has(c.salePrice) ? money(c.salePrice) : (has(c.soldPrice) ? money(c.soldPrice) : '');
    const bb = [
      has(c.beds) ? `${num(c.beds)}bd` : null,
      has(c.baths) ? `${num(c.baths)}ba` : null,
      has(c.sqft) ? `${num(c.sqft)} sqft` : null,
    ].filter(Boolean).join('/');
    const addr = has(c.address) ? c.address : 'a comparable';
    return [addr, bb, price ? `sold ${price}` : ''].filter(Boolean).join(' — ');
  });
  return makeChunk(ctx, 'comparables', ['Comparable sales nearby:', rows.join('; ') + '.']);
}

function buildPriceHistory(p, ctx) {
  const hist = Array.isArray(p.investmentData && p.investmentData.priceHistory)
    ? p.investmentData.priceHistory.filter((h) => h && has(h.year))
    : [];
  if (!hist.length) return null;
  const rows = hist.slice(0, 6).map((h) => {
    const ev = has(h.event) ? h.event : '';
    const pr = has(h.price) ? money(h.price) : '';
    return [h.year, ev, pr].filter(has).join(' ');
  });
  return makeChunk(ctx, 'priceHistory', ['Price history:', rows.join('; ') + '.']);
}

function buildMarketInsights(p, ctx) {
  const m = p.marketInsights || {};
  const parts = [];
  if (has(m.medianListPrice)) parts.push(`Median list price in the area is ${money(m.medianListPrice)}.`);
  if (has(m.medianSoldPrice)) parts.push(`Median sold price is ${money(m.medianSoldPrice)}.`);
  if (has(m.daysOnMarket)) parts.push(`Homes spend about ${num(m.daysOnMarket)} days on market.`);
  if (has(m.salesListPrice)) parts.push(`Sale-to-list price ratio is ${pct(m.salesListPrice)}.`);
  const tr = m.trends || {};
  const trendBits = [
    has(tr.listPrice) ? `list price ${tr.listPrice}` : null,
    has(tr.soldPrice) ? `sold price ${tr.soldPrice}` : null,
    has(tr.daysOnMarket) ? `days on market ${tr.daysOnMarket}` : null,
  ].filter(Boolean).join(', ');
  if (trendBits) parts.push(`Market trends: ${trendBits}.`);
  return makeChunk(ctx, 'marketInsights', parts.length ? ['Local market insights.', ...parts] : []);
}

function buildSchools(p, ctx) {
  const s = p.schools || {};
  const fmt = (arr, label) => {
    const items = (Array.isArray(arr) ? arr : []).filter((x) => x && has(x.name));
    if (!items.length) return '';
    const rows = items.slice(0, 6).map((x) => {
      const extra = [
        has(x.rating) ? `rating ${x.rating}` : null,
        has(x.grades) ? `grades ${x.grades}` : null,
        has(x.distance) ? `${x.distance} away` : null,
      ].filter(Boolean).join(', ');
      return extra ? `${x.name} (${extra})` : x.name;
    });
    return `${label} schools: ${rows.join('; ')}.`;
  };
  const parts = [fmt(s.public, 'Public'), fmt(s.private, 'Private')].filter(has);
  return makeChunk(ctx, 'schools', parts.length ? ['Schools near this property.', ...parts] : []);
}

function buildWalkability(p, ctx) {
  const w = p.walkScores || {};
  const parts = [];
  if (has(w.walkScore)) parts.push(`Walk Score is ${num(w.walkScore)}.`);
  if (has(w.transitScore)) parts.push(`Transit Score is ${num(w.transitScore)}.`);
  if (has(w.bikeScore)) parts.push(`Bike Score is ${num(w.bikeScore)}.`);
  return makeChunk(ctx, 'walkability', parts.length ? ['Walkability and transit.', ...parts] : []);
}

function buildAreaStats(p, ctx) {
  const stats = (p.areaStatistics && p.areaStatistics.areaStats) || {};
  const line = (label, o) => {
    if (!o) return '';
    const bits = [
      has(o.population) ? `population ${num(o.population)}` : null,
      has(o.medianAge) ? `median age ${num(o.medianAge)}` : null,
      has(o.medianHouseholdIncome) ? `median household income ${money(o.medianHouseholdIncome)}` : null,
    ].filter(Boolean).join(', ');
    return bits ? `${label} — ${bits}.` : '';
  };
  // Zip and city are the most relevant for a caller; skip county/national noise.
  const parts = [line('This ZIP code', stats.zip), line('The city', stats.city)].filter(has);
  return makeChunk(ctx, 'areaStats', parts.length ? ['Neighborhood demographics.', ...parts] : []);
}

function buildListingAgent(p, ctx) {
  const a = p.listingAgent || {};
  // name / company / phone allowed; email + licenseNumber are BLOCKED and never read.
  const parts = [];
  if (has(a.name)) {
    const at = has(a.company) ? ` at ${a.company}` : '';
    parts.push(`The listing agent is ${a.name}${at}.`);
  } else if (has(a.company)) {
    parts.push(`The listing company is ${a.company}.`);
  }
  if (has(a.phone)) parts.push(`Listing agent phone: ${a.phone}.`);
  return makeChunk(ctx, 'listingAgent', parts);
}

// Order matters only for readability of the output; retrieval is per-topic.
const BUILDERS = [
  buildBasics,
  buildAuction,
  buildDescription,
  buildInterior,
  buildExterior,
  buildCommunity,
  buildValuation,
  buildRental,
  buildTaxes,
  buildComparables,
  buildPriceHistory,
  buildMarketInsights,
  buildSchools,
  buildWalkability,
  buildAreaStats,
  buildListingAgent,
];

// ── Leak guard — second line of defence for the catastrophic fields ───────────
// Structural enforcement already guarantees reservePrice / currentBid are never
// read. This drops (and loudly logs) any chunk that nonetheless contains one of
// their values — so a future edit that accidentally surfaces them can never ship
// silently. Values that are ALSO legitimately public (e.g. reservePrice happens
// to equal the public ViharaValue) are excluded from the check to avoid nuking a
// valid chunk.
function stripLeaks(chunks, p) {
  const publicOk = new Set();
  const vhVal = p.investmentData && p.investmentData.valuation && p.investmentData.valuation.ViharaValue;
  if (has(vhVal)) publicOk.add(money(vhVal));

  const forbidden = new Set();
  const addForbidden = (v) => {
    if (!has(v)) return;
    const m = money(v);
    if (m && !publicOk.has(m)) forbidden.add(m);
  };
  addForbidden(p.reservePrice);
  addForbidden(p.currentBid);

  if (forbidden.size === 0) return chunks;

  return chunks.filter((c) => {
    const hit = [...forbidden].some((f) => c.text.includes(f));
    if (hit) {
      console.error(
        `[rag-chunker] BLOCKED LEAK: chunk "${c.key}" contained a confidential value; dropped. ` +
        `This indicates a builder read a blocked field — fix before re-syncing.`
      );
      return false;
    }
    return true;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Turn one property document into an array of topic chunks.
 *
 * @param {object} property  Plain object from productModel (use .lean()).
 * @returns {Array<{key,topic,text,metadata}>}  Empty array if the property has no
 *   usable content or no slug (slug is required — it's the retrieval filter key).
 */
function chunkProperty(property) {
  if (!property || typeof property !== 'object') return [];

  const slug = has(property.slug) ? String(property.slug).trim().toLowerCase() : '';
  if (!slug) {
    // No slug → cannot be filtered to on a call → not safe to index. Skip.
    console.warn('[rag-chunker] property has no slug; skipped.', String(property._id || ''));
    return [];
  }

  const ctx = {
    slug,
    propertyId: has(property._id) ? String(property._id) : '',
    propertyName: has(property.productName) ? String(property.productName).trim() : '',
    address: addressOf(property),
  };

  const chunks = BUILDERS
    .map((build) => {
      try {
        return build(property, ctx);
      } catch (err) {
        // One bad topic must never sink the whole property.
        console.error(`[rag-chunker] builder failed for slug "${slug}":`, err.message);
        return null;
      }
    })
    .filter(Boolean);

  return stripLeaks(chunks, property);
}

module.exports = {
  chunkProperty,
  BLOCKED_FIELDS, // exported so a test / audit can assert the list hasn't drifted
};
