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

const { conflictingRoomLines, hoaConflict, areaConflict } = require('./propertyDataConflicts');

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
  'bankId',                  // internal bank reference
  'brevoListId',             // internal marketing config
  // Listing agent: nothing about them is embedded (name, company, phone, email, licence).
  // Vihara decision, 2026-10-13: not shown in any way for now.
  'listingAgent',
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

// ── The ALLOWED list (the rule) ───────────────────────────────────────────────
// Only these fields are ever copied out of a property before the topic builders
// run, so a builder physically cannot read anything else. Adding a field to a
// chunk means adding it here first, in a reviewed change. `x[]` is a list; with
// a remainder (`schools.public[].name`) it is a list of objects and only that
// sub-field is copied; with no remainder it is a list of plain strings.
// scripts/ragChunkAudit.js checks real properties against this list.
const IDENTITY_FIELDS = ['_id', 'slug']; // used for keys and filters; never written into chunk text
const ALLOWED_FIELDS = [
  // basics
  'productName', 'street', 'city', 'state', 'zipCode', 'county', 'beds', 'baths',
  'assetType', 'propertyType', 'occupancyStatus', 'squareFootage', 'lotSize', 'yearBuilt',
  // auction terms. NOT commission: the admin form labels it 'Commission (%)', a percentage that was being
  // printed as dollars and as the buyer's premium. Vihara's published premium is 3% or $2,000, whichever is
  // greater, so the AI told a buyer there was none. Fee questions are handed to a person instead.
  'startBid', 'minIncrement', 'emd', 'onlineOrInPerson', 'auctionStartDate', 'auctionEndDate',
  // description (free text: also passes through scrubText below)
  'propertyDescription',
  // interior / exterior / community
  'propertyDetails.interiorDetails.bedroomsBathrooms[]', 'propertyDetails.interiorDetails.masterBathroom[]',
  'propertyDetails.interiorDetails.rooms[]', 'propertyDetails.interiorDetails.heating[]',
  'propertyDetails.interiorDetails.cooling[]', 'propertyDetails.interiorDetails.interiorFeatures[]',
  'propertyDetails.exteriorDetails.parking[]', 'propertyDetails.exteriorDetails.lotFeatures[]',
  'propertyDetails.exteriorDetails.exteriorFeatures[]', 'propertyDetails.exteriorDetails.constructionFeatures[]',
  'propertyDetails.community.communityInfo[]', 'propertyDetails.community.hoa[]', 'monthlyHOADues',
  // valuation (the public Vihara value, never the reserve)
  'investmentData.valuation.ViharaValue', 'investmentData.valuation.lowRange', 'investmentData.valuation.highRange',
  'investmentData.valuation.confidenceScore', 'investmentData.valuation.evaluatedDate',
  // rental
  'investmentData.rental.estimatedMonthlyRent', 'investmentData.rental.rentalValue',
  'investmentData.rental.estimatedAnnualRent', 'investmentData.rental.lowRange', 'investmentData.rental.highRange',
  'investmentData.rental.vacancyRate', 'investmentData.rental.averageRentalTrend',
  // taxes
  'investmentData.taxData.annualPropertyTax', 'investmentData.taxData.assessedValue',
  'investmentData.taxData.assessmentYear', 'investmentData.taxData.landValue', 'investmentData.taxData.improvementValue',
  'investmentData.taxHistory[].year', 'investmentData.taxHistory[].propertyTax', 'investmentData.taxHistory[].taxAssessment',
  // comparables and price history
  'investmentData.comparables[].address', 'investmentData.comparables[].salePrice', 'investmentData.comparables[].soldPrice',
  'investmentData.comparables[].beds', 'investmentData.comparables[].baths', 'investmentData.comparables[].sqft',
  'comparableMarket[].address', 'comparableMarket[].salePrice', 'comparableMarket[].soldPrice',
  'comparableMarket[].beds', 'comparableMarket[].baths', 'comparableMarket[].sqft',
  'investmentData.priceHistory[].year', 'investmentData.priceHistory[].event', 'investmentData.priceHistory[].price',
  // market insights
  'marketInsights.medianListPrice', 'marketInsights.medianSoldPrice', 'marketInsights.daysOnMarket',
  'marketInsights.salesListPrice', 'marketInsights.trends.listPrice', 'marketInsights.trends.soldPrice',
  'marketInsights.trends.daysOnMarket',
  // schools, walkability, area statistics
  'schools.public[].name', 'schools.public[].rating', 'schools.public[].grades', 'schools.public[].distance',
  'schools.private[].name', 'schools.private[].rating', 'schools.private[].grades', 'schools.private[].distance',
  'walkScores.walkScore', 'walkScores.transitScore', 'walkScores.bikeScore',
  'areaStatistics.areaStats.zip.population', 'areaStatistics.areaStats.zip.medianAge', 'areaStatistics.areaStats.zip.medianHouseholdIncome',
  'areaStatistics.areaStats.city.population', 'areaStatistics.areaStats.city.medianAge', 'areaStatistics.areaStats.city.medianHouseholdIncome',
];

function copyPath(src, dst, segs) {
  if (src == null || typeof src !== 'object') return;
  const [head, ...rest] = segs;
  const isList = head.endsWith('[]');
  const key = isList ? head.slice(0, -2) : head;
  const val = src[key];
  if (val === undefined) return;
  if (isList) {
    if (!Array.isArray(val)) return;
    if (rest.length === 0) {
      dst[key] = val.filter((v) => v == null || typeof v !== 'object'); // plain values only
      return;
    }
    if (!Array.isArray(dst[key])) dst[key] = val.map(() => ({}));
    val.forEach((el, i) => copyPath(el, dst[key][i], rest));
  } else if (rest.length === 0) {
    dst[key] = val;
  } else {
    if (val == null || typeof val !== 'object') return;
    if (!dst[key]) dst[key] = {};
    copyPath(val, dst[key], rest);
  }
}

/** A copy of the property holding ONLY the allowed fields (and the identity fields). */
function pickAllowed(property) {
  const out = {};
  for (const path of [...IDENTITY_FIELDS, ...ALLOWED_FIELDS]) copyPath(property, out, path.split('.'));
  return out;
}

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
  // EMD is 0 on almost every listing, which may mean "none required" or "never filled in". Until Vihara says
  // which, a 0 is not stated as fact: the chunk says it is not confirmed and the AI hands off.
  if (has(p.emd) && Number(p.emd) > 0) parts.push(`The earnest money deposit (EMD) required is ${money(p.emd)}.`);
  else parts.push('The earnest money deposit (EMD) for this property is not confirmed.');
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
  // The number fields (beds, baths, squareFootage) are the source of truth: they are what the auction
  // page shows, and the basics chunk states them. A listing-text line that contradicts them is left out,
  // so the AI never reads two different numbers for the same fact.
  const wrongRooms = new Set(conflictingRoomLines(p).map((c) => c.line));
  const wrongArea = areaConflict(p);
  const rooms = clean(i.bedroomsBathrooms).filter((l) => !wrongRooms.has(l));
  const features = clean(i.interiorFeatures).filter((l) => !(wrongArea && l === wrongArea.line));
  const parts = [];
  if (rooms.join(', ')) parts.push(`Bedrooms and bathrooms: ${rooms.join(', ')}.`);
  if (list(i.masterBathroom)) parts.push(`Master bathroom: ${list(i.masterBathroom)}.`);
  if (list(i.rooms)) parts.push(`Rooms: ${list(i.rooms)}.`);
  if (list(i.heating)) parts.push(`Heating: ${list(i.heating)}.`);
  if (list(i.cooling)) parts.push(`Cooling: ${list(i.cooling)}.`);
  if (features.join(', ')) parts.push(`Interior features: ${features.join(', ')}.`);
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
  // The dues field and the HOA text can disagree (dues 0 with "$922 monthly HOA fee" in the text). Neither
  // can be trusted then, so neither amount is written and the chunk says it is unconfirmed; the AI hands off.
  if (hoaConflict(p)) {
    parts.push('The monthly HOA fee for this property is not confirmed.');
  } else {
    if (list(c.hoa)) parts.push(`HOA: ${list(c.hoa)}.`);
    // monthlyHOADues: a real 0 is meaningful ("no monthly HOA dues").
    if (has(p.monthlyHOADues)) {
      parts.push(
        Number(p.monthlyHOADues) === 0
          ? 'There are no monthly HOA dues.'
          : `Monthly HOA dues are ${money(p.monthlyHOADues)}.`
      );
    }
  }
  return makeChunk(ctx, 'community', parts.length ? ['Community and HOA.', ...parts] : []);
}

function buildValuation(p, ctx) {
  const v = (p.investmentData && p.investmentData.valuation) || {};
  const parts = [];
  // NOTE: ViharaValue is the PUBLIC value. reservePrice is NOT read here.
  if (has(v.ViharaValue)) parts.push(`The market estimate is ${money(v.ViharaValue)}.`);
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

// Stored newest first (checked on every listing). A flat list reads as oldest to newest, which made the
// AI say a property "started at" its latest price. So the chunk is written oldest to newest, says so,
// and states the latest entry and the last sale outright.
const PRICE_HISTORY_ENTRIES = 10;
function buildPriceHistory(p, ctx) {
  const hist = Array.isArray(p.investmentData && p.investmentData.priceHistory)
    ? p.investmentData.priceHistory.filter((h) => h && has(h.year))
    : [];
  if (!hist.length) return null;
  const say = (h) => [h.year, has(h.event) ? h.event : '', has(h.price) ? money(h.price) : ''].filter(has).join(' ');
  const recent = hist.slice(0, PRICE_HISTORY_ENTRIES).reverse(); // oldest to newest
  const parts = [
    'Price history, oldest to newest:',
    recent.map(say).join('; ') + '.',
    `The most recent entry is: ${say(hist[0])}.`,
  ];
  if (hist.length > PRICE_HISTORY_ENTRIES) parts.push('Older entries are not shown.');
  const lastSale = hist.find((h) => /sold/i.test(String(h.event || '')) && has(h.price));
  if (lastSale) parts.push(`The most recent recorded sale was in ${lastSale.year} for ${money(lastSale.price)}.`);
  return makeChunk(ctx, 'priceHistory', parts);
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
];

// ── Free-text scrub — keeps secrets out of the words people wrote ────────────
// A property description (or any list of text) is written by a person, and could
// say "the seller will take 450k", give an email address or mention bidders.
// The leak guard below only knows the reserve price and current bid VALUES, so
// this drops, sentence by sentence, anything that looks like negotiation,
// bidding, or contact details. Dropped sentences are logged so they can be
// reviewed; the rest of the chunk is kept.
const SENSITIVE_SENTENCE = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                                              // email address
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,                    // phone number
  /\breserve\s+(?:price|amount|bid)\b/i,
  /\b(?:highest|current|top|winning)\s+bid(?:der)?s?\b/i,
  /\bbidders?\b/i,
  /\b(?:seller|owner|lender|bank)\b[^.]{0,60}\b(?:accept|take|entertain|consider|counter)\b/i,
  /\b(?:minimum|floor|bottom|lowest)\s+(?:acceptable\s+)?(?:price|offer|bid)\b(?!\s+increment)/i,
];

function scrubText(text) {
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !SENSITIVE_SENTENCE.some((re) => re.test(sentence)));
  return { text: kept.join(' ').trim(), dropped: sentences.length - kept.length };
}

function scrubChunks(chunks) {
  const out = [];
  for (const c of chunks) {
    const { text, dropped } = scrubText(c.text);
    if (dropped) {
      console.warn(`[rag-chunker] scrubbed ${dropped} sentence(s) from chunk "${c.key}" (looked like negotiation, bidding or contact details).`);
    }
    if (has(text)) out.push(dropped ? { ...c, text } : c);
  }
  return out;
}

// ── Leak guard — second line of defence for the catastrophic fields ───────────
// Structural enforcement already guarantees reservePrice / currentBid are never
// read. This drops (and loudly logs) any chunk that nonetheless contains one of
// their values — so a future edit that accidentally surfaces them can never ship
// silently. Values that are ALSO legitimately public (e.g. reservePrice happens
// to equal the public ViharaValue) are excluded from the check to avoid nuking a
// valid chunk.
//
// The same applies to every amount the chunks state ON PURPOSE: starting bid,
// minimum increment, EMD and the public valuation. An auction with
// no bids yet has currentBid === startBid, so without this the guard mistook
// the public starting bid for the live bid and dropped the whole auction chunk
// (EMD, increment, dates). A confidential value that differs from all of these
// is still blocked everywhere.
function stripLeaks(chunks, p) {
  const publicOk = new Set();
  const vhVal = p.investmentData && p.investmentData.valuation && p.investmentData.valuation.ViharaValue;
  if (has(vhVal)) publicOk.add(money(vhVal));
  for (const v of [p.startBid, p.minIncrement, p.emd]) {
    if (has(v) && Number(v) > 0) publicOk.add(money(v));
  }

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

  // Builders only ever see the allowed fields (see ALLOWED_FIELDS above).
  const safe = pickAllowed(property);

  const ctx = {
    slug,
    propertyId: has(safe._id) ? String(safe._id) : '',
    propertyName: has(safe.productName) ? String(safe.productName).trim() : '',
    address: addressOf(safe),
  };

  const chunks = BUILDERS
    .map((build) => {
      try {
        return build(safe, ctx);
      } catch (err) {
        // One bad topic must never sink the whole property.
        console.error(`[rag-chunker] builder failed for slug "${slug}":`, err.message);
        return null;
      }
    })
    .filter(Boolean);

  // The leak guard still checks against the ORIGINAL property (it needs the reserve and bid values).
  return stripLeaks(scrubChunks(chunks), property);
}

module.exports = {
  chunkProperty,
  BLOCKED_FIELDS, // exported so a test / audit can assert the list hasn't drifted
  ALLOWED_FIELDS,
  pickAllowed,
  scrubText,
};
