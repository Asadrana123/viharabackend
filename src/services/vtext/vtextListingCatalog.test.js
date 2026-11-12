const { test } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../../model/property/productModel");
const {
  toListing, formatCatalog, findMentionedSlugs, cleanFilters, buildListingQuery, describeFilters,
  searchListings, loadOpenIndex, buildExtractPrompt, clearCache, statesNear, nearbyFilters,
} = require("./vtextListingCatalog");
const { buildPrompt } = require("./vtextAiReplyService");
const { checkReplyAmounts, collectSourceTexts } = require("./vtextReplyGuard");

const baltimore = {
  slug: "2529-2531-e-monument-st-baltimore", productName: "2529-2531 E Monument St, Baltimore, MD",
  street: "2529-2531 E Monument St", city: "Baltimore", state: "MD", beds: 3, baths: 1, squareFootage: 2363,
  propertyType: "Condo, Townhouse, other single unit", startBid: 58687, occupancyStatus: "Vacant",
  investmentData: { valuation: { ViharaValue: 66111 }, rental: { estimatedMonthlyRent: 1887 } },
  auctionStartDate: "2026-11-15T16:00:00Z", auctionEndDate: "2026-11-15T20:15:00Z",
};
const lawSt1 = { slug: "1983-law-st-new-orleans", street: "1983 Law St", city: "New Orleans", state: "LA", startBid: 126477 };
const lawSt2 = { slug: "1977-law-st-new-orleans", street: "1977 Law St", city: "New Orleans", state: "LA", startBid: 133777 };
const prieur = { slug: "2508-12-s-prieur-st-new-orleans", street: "2508-12 S Prieur St", city: "New Orleans", state: "LA", startBid: 257296 };
const sf = { slug: "241-10th-st-302-san-francisco", street: "241 10th Street", city: "San Francisco", state: "CA", startBid: 841500 };
const facets = { cities: ["Baltimore", "New Orleans", "San Francisco"], counties: ["Merced"], states: ["CA", "LA", "MD", "Texas"], propertyTypes: ["Multi-family", "Single Family"] };
const NOW = new Date("2026-11-11T00:00:00Z");

/** Product.find(...).select(...)[.sort(...).limit(...)].lean() returning `docs`, and countDocuments returning `count`. */
function mockProduct(t, { find, count, aggregate }) {
  const chain = (docs) => {
    const c = { select: () => c, sort: () => c, limit: () => c, lean: async () => docs };
    return c;
  };
  t.mock.method(Product, "find", (q) => chain(find(q)));
  if (count) t.mock.method(Product, "countDocuments", async (q) => count(q));
  if (aggregate) t.mock.method(Product, "aggregate", async (pipeline) => aggregate(pipeline));
}

test("a listing line holds the public facts and the link, never a current bid or reserve", () => {
  const l = toListing({ ...baltimore, currentBid: 70000, reservePrice: 90000 });
  assert.match(l.line, /^2529-2531 E Monument St, Baltimore, MD/);
  assert.match(l.line, /3 bed, 1 bath, 2,363 sq ft/);
  assert.match(l.line, /starting bid \$58,687/);
  assert.match(l.line, /market estimate \$66,111/);
  assert.match(l.line, /rent estimate \$1,887 a month/);
  assert.match(l.line, /auction Sun, Nov 15, 11 AM–3:15 PM ET/);
  assert.match(l.line, /\/listing\/2529-2531-e-monument-st-baltimore$/);
  assert.doesNotMatch(l.line, /70,000|90,000/);
  assert.equal(formatCatalog([l]), `- ${l.line}`);
});

test("a named street or a town with 1 or 2 homes picks those homes", () => {
  const all = [baltimore, lawSt1, lawSt2, prieur, sf];
  assert.deepEqual(findMentionedSlugs("what are the taxes on the Baltimore one?", all), [baltimore.slug]);
  assert.deepEqual(findMentionedSlugs("tell me about Monument St", all), [baltimore.slug]);
  assert.deepEqual(findMentionedSlugs("is the Prieur house vacant", all), [prieur.slug]);
  assert.deepEqual(findMentionedSlugs("anything in New Orleans?", all), []); // 3 homes there: not one
  assert.deepEqual(findMentionedSlugs("is there a law about this", all), []); // "Law" is too short
  assert.deepEqual(findMentionedSlugs("the 10th of the month", all), []);
  assert.deepEqual(findMentionedSlugs("San Francisco condo?", all), [sf.slug]);
  assert.deepEqual(findMentionedSlugs("", all), []);
});

test("a home named by its full address, a link, or a short or numbered street with St/Ave", () => {
  const all = [baltimore, lawSt1, lawSt2, prieur, sf];
  assert.deepEqual(findMentionedSlugs("is 1983 Law St vacant?", all), [lawSt1.slug]);
  assert.deepEqual(findMentionedSlugs("what about 1977 law", all), [lawSt2.slug]);
  assert.deepEqual(findMentionedSlugs("https://www.vihara.ai/listing/1983-law-st-new-orleans is this one vacant?", all), [lawSt1.slug]);
  assert.deepEqual(findMentionedSlugs("vihara.ai/auction/2529-2531-e-monument-st-baltimore", all), [baltimore.slug]);
  assert.deepEqual(findMentionedSlugs("the Law St ones", all), [lawSt1.slug, lawSt2.slug]);
  assert.deepEqual(findMentionedSlugs("the 10th street one", all), [sf.slug]);
  assert.deepEqual(findMentionedSlugs("2508 Prieur", all), [prieur.slug]);
  assert.deepEqual(findMentionedSlugs("I paid 1983 dollars in law fees", all), [lawSt1.slug]); // known: number + street word
  assert.deepEqual(findMentionedSlugs("the law changed in 1990", all), []);
  assert.deepEqual(findMentionedSlugs("vihara.ai/listing/some-closed-home", all), []);
});

test("filters keep only real values, spelled as stored", () => {
  assert.equal(cleanFilters({ asksAboutHomes: false, maxPrice: 200000 }, facets), null);
  assert.equal(cleanFilters(null, facets), null);
  const f = cleanFilters({
    asksAboutHomes: true, maxPrice: 200000, minPrice: -5, cities: ["baltimore", "Denver"], states: ["texas"],
    counties: [], minBeds: 3, minBaths: "2", propertyTypes: ["single family", "castle"], occupancy: "vacant", sort: "weird",
    unmatchedPlace: "Denver",
  }, facets);
  assert.deepEqual(f, {
    maxPrice: 200000, minPrice: null, cities: ["Baltimore"], counties: [], states: ["Texas"], minBeds: 3, minBaths: null,
    propertyTypes: ["Single Family"], occupancy: "vacant", sort: "price_asc", unmatchedPlace: "Denver",
  });
  const swapped = cleanFilters({ asksAboutHomes: true, minPrice: 300000, maxPrice: 100000 }, facets);
  assert.equal(swapped.minPrice, 100000);
  assert.equal(swapped.maxPrice, 300000);
});

test("the Mongo query: open homes, the filters, the lead's own homes left out", () => {
  const f = cleanFilters({ asksAboutHomes: true, maxPrice: 200000, cities: ["Baltimore"], states: ["LA"], minBeds: 3, occupancy: "vacant" }, facets);
  const q = buildListingQuery(f, { now: NOW, excludeSlugs: ["401-rensselaer-ave-ogdensburg"] });
  assert.equal(q.showOnAuctions, true);
  assert.deepEqual(q.status, { $ne: "sold" });
  assert.deepEqual(q.isTestProperty, { $ne: true });
  assert.deepEqual(q.$or, [{ auctionEndDate: { $exists: false } }, { auctionEndDate: null }, { auctionEndDate: { $gt: NOW } }]);
  assert.deepEqual(q.slug.$nin, ["401-rensselaer-ave-ogdensburg"]);
  assert.deepEqual(q.startBid, { $lte: 200000 });
  assert.deepEqual(q.$and, [{ $or: [{ city: { $in: ["Baltimore"] } }, { state: { $in: ["LA"] } }] }]);
  assert.deepEqual(q.beds, { $gte: 3 });
  assert.deepEqual(q.occupancyStatus, { $regex: "^vacant", $options: "i" });

  const noPrice = buildListingQuery(f, { now: NOW, drop: "price" });
  assert.equal(noPrice.startBid, undefined);
  assert.ok(noPrice.$and);
  const any = buildListingQuery(f, { now: NOW, drop: "all" });
  assert.equal(any.startBid, undefined);
  assert.equal(any.$and, undefined);
  assert.equal(any.beds, undefined);
});

test("what was asked, in words", () => {
  const f = cleanFilters({ asksAboutHomes: true, maxPrice: 200000, cities: ["Baltimore"], minBeds: 3, unmatchedPlace: "Denver" }, facets);
  assert.equal(describeFilters(f), "starting bid up to $200,000, in Baltimore, in Denver (we have no homes there), 3+ bedrooms");
  assert.equal(describeFilters(cleanFilters({ asksAboutHomes: true }, facets)), "any home");
});

test("search: the matches and how many; none match gives the closest, marked", async (t) => {
  const f = cleanFilters({ asksAboutHomes: true, maxPrice: 200000, states: ["LA"] }, facets);

  mockProduct(t, { find: () => [lawSt1, lawSt2], count: () => 2 });
  const hit = await searchListings(f, { now: NOW });
  assert.equal(hit.total, 2);
  assert.equal(hit.relaxed, "");
  assert.deepEqual(hit.listings.map((l) => l.slug), [lawSt1.slug, lawSt2.slug]);
  t.mock.restoreAll();

  // nothing under the price: the same place without the price
  mockProduct(t, { find: (q) => (q.startBid ? [] : [prieur]), count: (q) => (q.startBid ? 0 : 1) });
  const closest = await searchListings(f, { now: NOW });
  assert.equal(closest.total, 0);
  assert.equal(closest.relaxed, "price");
  assert.deepEqual(closest.listings.map((l) => l.slug), [prieur.slug]);
  t.mock.restoreAll();

  // nothing in the place at all: any open home, closest in starting bid to the price they gave
  let pipeline;
  mockProduct(t, { find: (q) => (q.$and ? [] : [baltimore]), count: (q) => (q.$and ? 0 : 1), aggregate: (p) => { pipeline = p; return [baltimore]; } });
  const any = await searchListings(f, { now: NOW });
  assert.equal(any.relaxed, "all");
  assert.deepEqual(any.listings.map((l) => l.slug), [baltimore.slug]);
  assert.deepEqual(pipeline[1].$addFields._gap, { $abs: { $subtract: [{ $ifNull: ["$startBid", 0] }, 200000] } });
  assert.equal(pipeline[0].$match.$and, undefined);
  t.mock.restoreAll();

  // only a place we have no homes in ("anything in Denver under 200k?"): 0 match, closest elsewhere with the price kept
  const denver = cleanFilters({ asksAboutHomes: true, maxPrice: 200000, unmatchedPlace: "Denver" }, facets);
  const seen = [];
  mockProduct(t, { find: (q) => { seen.push(q); return [baltimore]; }, count: () => 1 });
  const elsewhere = await searchListings(denver, { now: NOW });
  assert.equal(elsewhere.total, 0);
  assert.equal(elsewhere.relaxed, "place");
  assert.deepEqual(elsewhere.listings.map((l) => l.slug), [baltimore.slug]);
  assert.deepEqual(seen[0].startBid, { $lte: 200000 });
});

const capitolHeights = { slug: "703-59th-ave-capitol-heights", street: "703 59th Ave", city: "Capitol Heights", state: "MD", startBid: 126753 };
const inState = (q, st) => JSON.stringify(q.$and || []).includes(`"state":{"$in":${JSON.stringify(st)}`);

test("the state of the towns asked, from the open homes (their own home counts)", () => {
  const homes = [baltimore, lawSt1, capitolHeights];
  const f = cleanFilters({ asksAboutHomes: true, cities: ["Baltimore"] }, facets);
  assert.deepEqual(statesNear(f, homes), ["MD"]);
  assert.deepEqual(nearbyFilters(f, ["MD"]).states, ["MD"]);
  assert.deepEqual(nearbyFilters(f, ["MD"]).cities, []);
  const stateOnly = cleanFilters({ asksAboutHomes: true, states: ["MD"] }, facets);
  assert.deepEqual(statesNear(stateOnly, homes), []);
  assert.equal(nearbyFilters(stateOnly, ["MD"]), null); // they already asked for the state
  assert.equal(nearbyFilters(f, []), null);
});

test("search: nothing else in the town gives the nearest homes in the same state first", async (t) => {
  // "other properties in the area?" from the Baltimore lead: Baltimore has only their own home
  const f = cleanFilters({ asksAboutHomes: true, cities: ["Baltimore"] }, facets);
  const queries = [];
  mockProduct(t, {
    find: (q) => { queries.push(q); return inState(q, ["MD"]) ? [capitolHeights] : []; },
    count: (q) => (inState(q, ["MD"]) ? 1 : 0),
    aggregate: () => assert.fail("should not fall back to any home"),
  });
  const near = await searchListings(f, { now: NOW, excludeSlugs: [baltimore.slug], nearStates: ["MD"], anchorBid: 58687 });
  assert.equal(near.total, 0);
  assert.equal(near.relaxed, "state");
  assert.deepEqual(near.listings.map((l) => l.slug), [capitolHeights.slug]);
  assert.deepEqual(queries[queries.length - 1].slug.$nin, [baltimore.slug]);
  t.mock.restoreAll();

  // with a price: same state at that price, then the town at any price, then the state at any price
  const cheap = cleanFilters({ asksAboutHomes: true, cities: ["Baltimore"], maxPrice: 50000 }, facets);
  mockProduct(t, {
    find: (q) => (inState(q, ["MD"]) && !q.startBid ? [capitolHeights] : []),
    count: (q) => (inState(q, ["MD"]) && !q.startBid ? 1 : 0),
    aggregate: () => assert.fail("should not fall back to any home"),
  });
  const nearAnyPrice = await searchListings(cheap, { now: NOW, nearStates: ["MD"] });
  assert.equal(nearAnyPrice.relaxed, "state_price");
  assert.deepEqual(nearAnyPrice.listings.map((l) => l.slug), [capitolHeights.slug]);
  t.mock.restoreAll();

  // nothing in the state either: still something, the homes closest in starting bid to their own home
  let pipeline;
  mockProduct(t, { find: () => [], count: () => 0, aggregate: (p) => { pipeline = p; return [lawSt1, capitolHeights]; } });
  const something = await searchListings(f, { now: NOW, nearStates: ["MD"], anchorBid: 58687 });
  assert.equal(something.relaxed, "all");
  assert.deepEqual(something.listings.map((l) => l.slug), [lawSt1.slug, capitolHeights.slug]);
  assert.deepEqual(pipeline[1].$addFields._gap.$abs.$subtract[1], 58687);
  t.mock.restoreAll();

  // no open homes at all
  mockProduct(t, { find: () => [], count: () => 0, aggregate: () => [] });
  const none = await searchListings(f, { now: NOW, nearStates: ["MD"], anchorBid: 58687 });
  assert.equal(none.relaxed, "");
  assert.deepEqual(none.listings, []);
});

test("the open-home index: towns, states and types from the data; a database problem gives an empty one", async (t) => {
  clearCache();
  mockProduct(t, { find: () => [baltimore, lawSt1, sf] });
  const index = await loadOpenIndex({ now: NOW });
  assert.equal(index.homes.length, 3);
  assert.deepEqual(index.facets.cities, ["Baltimore", "New Orleans", "San Francisco"]);
  assert.deepEqual(index.facets.states, ["CA", "LA", "MD"]);
  t.mock.restoreAll();
  clearCache();

  t.mock.method(Product, "find", () => ({ select: () => ({ lean: async () => { throw new Error("db down"); } }) }));
  const empty = await loadOpenIndex();
  assert.deepEqual(empty.homes, []);
  clearCache();
});

test("the filter step is given our real places and the conversation", () => {
  const p = buildExtractPrompt({ messages: [{ direction: "in", body: "anything under 200k?" }, { direction: "out", body: "Yes, 4" }, { direction: "in", body: "what about New Orleans" }], replyToBody: "what about New Orleans", facets });
  assert.match(p, /Towns: Baltimore, New Orleans, San Francisco/);
  assert.match(p, /States: CA, LA, MD, Texas/);
  assert.match(p, /Contact: anything under 200k\?/);
  assert.match(p, /keeps the 200k limit/);
  assert.doesNotMatch(p, /The home they signed up for/);
  const withOwn = buildExtractPrompt({ messages: [], replyToBody: "anything else in the area?", facets, ownPlace: "Baltimore, MD" });
  assert.match(withOwn, /The home they signed up for is in Baltimore, MD\. "The area"/);
});

const knowledge = (otherHomes, catalogText = "") => ({
  properties: [{ slug: "401-rensselaer-ave-ogdensburg", name: "401 Rensselaer Ave", current: true, facts: { property_price: "$25,000" } }],
  leadDetails: [], retrievedText: "", faqText: "", ...(otherHomes ? { otherHomes, catalogText } : {}),
});
const args = (k) => ({ contact: { name: "Margaret" }, messages: [{ direction: "in", body: "anything under 200k?" }], replyToBody: "anything under 200k?", knowledge: k });
const base = { searched: true, failed: false, description: "starting bid up to $200,000", total: 0, relaxed: "", matchesText: "", namedText: "" };

test("the prompt: matches with their count, the closest when none match, and the rules", () => {
  const lines = formatCatalog([toListing(baltimore), toListing(lawSt1)]);
  const p = buildPrompt(args(knowledge({ ...base, total: 4, matchesText: lines }, lines)));
  assert.match(p, /Other homes that match what they asked \(starting bid up to \$200,000\)[^\n]*4 open homes match; these are the first 2:/);
  assert.match(p, /starting bid \$58,687/);
  assert.match(p, /Name at most 3, in the order given/);
  assert.match(p, /Do not bring up other homes when they did not ask/);

  const closest = buildPrompt(args(knowledge({ ...base, relaxed: "price", matchesText: lines }, lines)));
  assert.match(closest, /none of our open homes match what they asked[^\n]*The closest ones, which do NOT fit[^\n]*outside the price/);
  assert.match(closest, /ALWAYS offer them/);
  const nearby = buildPrompt(args(knowledge({ ...base, relaxed: "state", matchesText: lines }, lines)));
  assert.match(nearby, /the nearest, in the same state/);

  const none = buildPrompt(args(knowledge({ ...base })));
  assert.match(none, /we have no other homes open right now/);

  const notAsked = buildPrompt(args(knowledge({ ...base, searched: false })));
  assert.match(notAsked, /Other homes: not searched/);

  const failed = buildPrompt(args(knowledge({ ...base, searched: false, failed: true })));
  assert.match(failed, /search for other homes did not work/);

  const named = buildPrompt(args(knowledge({ ...base, searched: false, namedText: `- ${toListing(baltimore).line}` })));
  assert.match(named, /Other homes they named:\n- 2529-2531 E Monument St/);
});

test("with the home search switched off the prompt has no other-homes part", () => {
  const p = buildPrompt(args(knowledge(null)));
  assert.doesNotMatch(p, /Other homes/);
  assert.doesNotMatch(p, /Name at most 3/);
});

test("the dollar check accepts a price from the search and still stops an invented one", () => {
  const k = knowledge({ ...base, total: 1, matchesText: `- ${toListing(baltimore).line}` }, `- ${toListing(baltimore).line}`);
  const sourceTexts = collectSourceTexts({ knowledge: k, messages: [], replyToBody: "anything under 200k?" });
  assert.equal(checkReplyAmounts({ reply: "Yes, 2529-2531 E Monument St in Baltimore, starting bid $58,687.", sourceTexts }).ok, true);
  assert.equal(checkReplyAmounts({ reply: "Yes, one in Baltimore at $45,000.", sourceTexts }).ok, false);
});
