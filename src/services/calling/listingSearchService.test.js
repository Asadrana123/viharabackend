// Maya's live-listings search: the findListings tool, the pre-call block, and the
// Vapi call settings that carry them. No database or network: productModel.find
// is swapped for an in-memory fixture before anything uses it.
process.env.VAPI_WEBHOOK_URL = "https://example.test/api/vapi/webhook";
process.env.VAPI_WEBHOOK_SECRET = "test-secret";
process.env.OUTBOUND_DISABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");

const productModel = require("../../model/property/productModel");

const NOW = new Date("2026-11-12T18:00:00Z");
const day = (n) => new Date(NOW.getTime() + n * 86400000);

const base = {
  showOnAuctions: true, isTestProperty: false, status: "active",
  propertyType: "Single Family", onlineOrInPerson: "Online", baths: 2,
};
const FIXTURE = [
  { ...base, _id: "a1", street: "449 Georgia St", city: "Atlanta", state: "GA", zipCode: "30312", beds: 3, startBid: 185000, currentBid: 185000,
    investmentData: { valuation: { ViharaValue: 260000 } }, auctionStartDate: day(8), auctionEndDate: day(8), slug: "449-georgia-st-atlanta", reservePrice: 999999 },
  { ...base, _id: "a2", street: "12 Peach Ave", city: "Atlanta", state: "GA", zipCode: "30310", beds: 4, startBid: 320000, currentBid: 340000,
    auctionStartDate: day(-0.1), auctionEndDate: day(0.1), slug: "12-peach-ave-atlanta" },
  { ...base, _id: "a3", street: "5 Pine Rd", city: "Savannah", state: "Georgia", zipCode: "31401", beds: 2, baths: 1.5, startBid: 150000, currentBid: 0,
    propertyType: "Condo, Townhouse, other single unit", auctionStartDate: day(20), auctionEndDate: day(20), slug: "5-pine-rd-savannah" },
  { ...base, _id: "c1", street: "1496 Adeline St", city: "Oakland", state: "CA", zipCode: "94607", beds: 3, startBid: 300000, currentBid: 300000,
    auctionStartDate: day(-30), auctionEndDate: day(-30), slug: "1496-adeline-st-oakland" },
  { ...base, _id: "t1", street: "9 Elm St", city: "Houston", state: "TX", zipCode: "77002", beds: 5, startBid: 410000, currentBid: 410000,
    propertyType: "Multi-family", auctionStartDate: day(3), auctionEndDate: day(3), slug: "9-elm-st-houston" },
];

let lastFilter = null;
productModel.find = (filter) => {
  lastFilter = filter;
  return { select: () => ({ lean: async () => FIXTURE }) };
};

const svc = require("./listingSearchService");
const ids = (r) => r.matches.map((p) => p._id);

test("live filter is the public /auctions filter minus cancelled auctions", async () => {
  svc.clearListingsCache();
  await svc.getLiveListings();
  assert.deepEqual(lastFilter, { showOnAuctions: true, isTestProperty: { $ne: true }, status: { $nin: ["sold", "cancelled"] } });
});

test("city search returns only that city, open-now auction first", () => {
  const r = svc.searchListings(FIXTURE, { city: "atlanta" }, NOW);
  assert.deepEqual(ids(r), ["a2", "a1"]);
  assert.equal(r.scope, "city");
  assert.deepEqual(r.relaxed, []);
});

test("state accepts a name or a code", () => {
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { state: "georgia" }, NOW)).sort(), ["a1", "a2", "a3"]);
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { state: "GA" }, NOW)).sort(), ["a1", "a2", "a3"]);
});

test("budget compares with the current bid once bidding has moved", () => {
  // a2 starts at 320k but the bid is at 340k, so a 330k budget excludes it.
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { city: "Atlanta", maxPrice: 330000 }, NOW)), ["a1"]);
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { city: "Atlanta", maxPrice: "350k" }, NOW)), ["a2", "a1"]);
});

test("bedrooms and spoken property types filter", () => {
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { state: "GA", minBeds: 4 }, NOW)), ["a2"]);
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { state: "GA", propertyType: "condo" }, NOW)), ["a3"]);
  assert.deepEqual(ids(svc.searchListings(FIXTURE, { propertyType: "duplex" }, NOW)), ["t1"]);
});

test("a city with nothing widens to its state and says so", () => {
  const q = { city: "Macon", state: "GA" };
  const r = svc.searchListings(FIXTURE, q, NOW);
  assert.equal(r.scope, "state");
  assert.equal(r.total, 3);
  assert.match(svc.formatToolResult(r, q, FIXTURE, NOW), /Nothing in Macon itself; these are elsewhere in Georgia/);
});

test("too-tight budget is relaxed and the cheapest comes first, flagged as not exact", () => {
  const q = { city: "Atlanta", maxPrice: 100000 };
  const r = svc.searchListings(FIXTURE, q, NOW);
  assert.deepEqual(r.relaxed, ["price"]);
  assert.deepEqual(ids(r), ["a1", "a2"]);
  assert.match(svc.formatToolResult(r, q, FIXTURE, NOW), /^NO EXACT MATCH for that price range/);
});

test("an area with no listings says so and names where we do have homes", () => {
  const q = { city: "Miami", state: "FL" };
  const r = svc.searchListings(FIXTURE, q, NOW);
  assert.equal(r.areaFound, false);
  const text = svc.formatToolResult(r, q, FIXTURE, NOW);
  assert.match(text, /^NO LIVE LISTINGS in Miami, Florida/);
  assert.match(text, /Georgia \(3\)/);
  assert.doesNotMatch(text, /Adeline|Georgia St/); // no homes from elsewhere slipped in
});

test("no live listings at all", () => {
  assert.match(svc.formatToolResult({ matches: [] }, {}, [], NOW), /^NO LIVE LISTINGS right now/);
});

test("a listing is spoken in words, in the property's own day, without the reserve price", () => {
  const line = svc.describeListing(FIXTURE[0], NOW);
  assert.match(line, /449 Georgia St, Atlanta, Georgia: three bed, two bath single-family home/);
  assert.match(line, /starting bid one hundred eighty-five thousand dollars/);
  assert.match(line, /Vihara's value estimate two hundred sixty thousand dollars/);
  assert.match(line, /online auction on Friday, November 20/);
  assert.match(line, /vihara\.ai\/listing\/449-georgia-st-atlanta/);
  assert.doesNotMatch(line, /nine hundred ninety-nine/);
  assert.match(svc.describeListing(FIXTURE[1], NOW), /current bid three hundred forty thousand dollars; online auction is open for bidding now/);
  assert.match(svc.describeListing(FIXTURE[3], NOW), /date is being set/);
  assert.match(svc.describeListing(FIXTURE[2], NOW), /two bed, one-and-a-half bath condo or townhome/);
});

test("tool result shows at most three homes", async () => {
  svc.clearListingsCache();
  const text = await svc.runFindListingsTool({});
  assert.match(text, /^5 live listings match\. Showing the top 3\./);
  assert.equal((text.match(/^\d\. /gm) || []).length, 3);
});

test("form answers become areas and a budget", () => {
  assert.deepEqual(svc.areasFromPerson({ market: "Dallas, TX and Kingwood, TX" }), [
    { city: "Dallas", state: "TX" }, { city: "Kingwood", state: "TX" },
  ]);
  assert.deepEqual(svc.areasFromPerson({ where: "Georgia" }), [{ state: "GA" }]);
  assert.deepEqual(svc.areasFromPerson({ city: "Atlanta", state: "GA" }), [{ city: "Atlanta", state: "GA" }]);
  assert.equal(svc.maxBudgetFromPerson({ dealSize: "$250k - $500k" }), 500000);
  assert.equal(svc.maxBudgetFromPerson({ budget: "Under 300,000" }), 300000);
  assert.equal(svc.maxBudgetFromPerson({}), 0);
});

test("pre-call block: inventory overview plus homes that fit the lead", async () => {
  svc.clearListingsCache();
  const ctx = await svc.buildListingsContext({ market: "Atlanta, GA", budget: "under 200k" }, NOW);
  assert.match(ctx, /^Right now there are five live listings on Vihara, in: Georgia \(3\), California \(1\), Texas \(1\)\./);
  assert.match(ctx, /449 Georgia St/);
  assert.doesNotMatch(ctx, /12 Peach Ave/); // over budget
  // A lead in an area with no homes only gets the overview, never a wrong-area pick.
  const none = await svc.buildListingsContext({ market: "Miami, FL" }, NOW);
  assert.doesNotMatch(none, /^\d\. /m);
});

test("pre-call block never throws", async () => {
  const realFind = productModel.find;
  productModel.find = () => { throw new Error("db down"); };
  svc.clearListingsCache();
  assert.equal(await svc.buildListingsContext({}), "");
  productModel.find = realFind;
});

test("every Vapi call carries the findListings tool, its rules and the listings block", () => {
  const { buildAssistantOverrides } = require("./vapiService");
  const o = buildAssistantOverrides({ fullName: "Test Lead" }, "", {}, { systemPrompt: "You are Maya." }, "", "Right now there are five live listings");
  const names = o.model.tools.map((t) => t.function.name);
  assert.deepEqual(names, ["scheduleCallback", "findListings"]);
  const tool = o.model.tools[1];
  assert.equal(tool.server.url, process.env.VAPI_WEBHOOK_URL);
  assert.equal(tool.messages[0].type, "request-start");
  const sys = o.model.messages[0].content;
  assert.match(sys, /LIVE LISTINGS ON VIHARA \(findListings tool\)/);
  assert.match(sys, /Live listings right now \(from the database a moment ago\):\nRight now there are five/);
  // Rules are added once even if the authored prompt already has them.
  const again = buildAssistantOverrides({}, "", {}, { systemPrompt: sys }, "", "");
  assert.equal((again.model.messages[0].content.match(/LIVE LISTINGS ON VIHARA/g) || []).length, 1);
});

test("webhook answers findListings next to scheduleCallback", async () => {
  svc.clearListingsCache();
  const { handleVapiWebhook } = require("../../controller/calling/voiceCallbackController");
  const req = {
    headers: { "x-vapi-secret": "test-secret" },
    query: {},
    body: { message: { type: "tool-calls", call: { id: "call_1" }, toolCallList: [
      { id: "tc_1", function: { name: "findListings", arguments: JSON.stringify({ city: "Houston" }) } },
    ] } },
  };
  const out = await new Promise((resolve, reject) => {
    const res = { status: () => res, json: resolve };
    handleVapiWebhook(req, res, reject);
  });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].toolCallId, "tc_1");
  assert.match(out.results[0].result, /^1 live listing matches\./);
  assert.match(out.results[0].result, /9 Elm St, Houston, Texas: five bed, two bath multi-family property/);
});

test("webhook rejects a call without the secret", async () => {
  const { handleVapiWebhook } = require("../../controller/calling/voiceCallbackController");
  const err = await new Promise((resolve) => {
    const res = { status: () => res, json: () => resolve(null) };
    handleVapiWebhook({ headers: {}, query: {}, body: { message: { type: "tool-calls" } } }, res, resolve);
  });
  assert.equal(err.statuscode, 401);
});
