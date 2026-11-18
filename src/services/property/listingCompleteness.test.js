// node --test src/services/property/listingCompleteness.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

// ── Stubs: Firecrawl and the two parsers, replaced BEFORE the import service is loaded ──────────────
// Each scrape pops the next parsed result from `queue` ("fail" = the scrape throws).
const firecrawlService = require("../integrations/firecrawlService");
const detailsParser = require("./parsers/marketDataDetailsParser");
const jsonParser = require("./parsers/marketDataPropertyJsonParser");
const imageParser = require("./parsers/marketDataImageParser");

let queue = [];
let current = null;
let scrapes = 0;
firecrawlService.scrapePropertyDetails = async () => {
  scrapes += 1;
  current = queue.shift();
  if (current === "fail") throw new Error("All scraping engines failed");
  return { data: { markdown: "x" } };
};
firecrawlService.scrapePropertyImages = async () => {
  if (current === "fail") throw new Error("All scraping engines failed");
  return { data: { rawHtml: "x" } };
};
detailsParser.processMarketDataResponse = () => current.md;
jsonParser.parseMarketDataPropertyJson = () => current.json;
imageParser.extractMarketDataImages = () => current.photos || { image: "", otherImages: [] };

const { fetchMarketDataListing } = require("./propertyImportService");
const { missingFields, fillGaps, worthRetry } = require("./listingCompleteness");

const full = () => ({
  price: 524900,
  homeStatus: "FOR_SALE",
  address: { street: "960 Larrabee St", city: "West Hollywood", state: "CA", zipCode: "90069" },
  coordinates: { latitude: 34.08, longitude: -118.38 },
  specs: { beds: 2, baths: 2, sqft: 889, yearBuilt: 1962, lotSizeSqft: 20000 },
  financials: { rentEstimate: 3717, estimate: 519160 },
  details: { apn: "4339015088", homeType: "Condo" },
  description: "A 2 bed condo.",
  schools: [{ name: "A" }],
  priceHistory: [{ year: 2025 }],
  taxHistory: [{ year: 2025, propertyTax: 5644 }],
  listingAgent: { name: "Stephen Giltner", licenseNumber: "01177161" },
});
const photos = { image: "a.jpg", otherImages: ["b.jpg"] };
// What the parser merge gives (json first for core facts, markdown for history) — the stubs return halves.
const scrape = (listing, extra = {}) => ({ json: listing, md: listing, photos, ...extra });

test.beforeEach(() => {
  queue = [];
  scrapes = 0;
});

// ── checklist ──────────────────────────────────────────────────────────────────────────────────────
test("a complete listing has nothing missing", () => {
  assert.deepEqual(missingFields(full(), ["a.jpg"]), []);
});

test("missing APN, tax history, license and photos are each named", () => {
  const m = full();
  m.details.apn = null;
  m.taxHistory = [];
  m.listingAgent.licenseNumber = "";
  const keys = missingFields(m, []).map((f) => f.key);
  assert.deepEqual(keys.sort(), ["agentLicense", "apn", "photos", "taxHistory"].sort());
});

test("license is only required for California listings", () => {
  const m = full();
  m.address.state = "MD";
  m.listingAgent.licenseNumber = null;
  assert.equal(missingFields(m, ["a.jpg"]).some((f) => f.key === "agentLicense"), false);
});

test("off-market pages are not retried and don't need a price or agent", () => {
  const m = full();
  m.homeStatus = "OTHER";
  m.price = null;
  m.listingAgent = null;
  m.details.apn = null;
  const missing = missingFields(m, ["a.jpg"]);
  assert.deepEqual(missing.map((f) => f.key), ["apn"]);
  assert.equal(worthRetry(m, missing), false);
});

test("NaN and blank strings count as missing", () => {
  const m = full();
  m.specs.sqft = NaN;
  m.description = "   ";
  assert.deepEqual(missingFields(m, ["a.jpg"]).map((f) => f.key).sort(), ["description", "sqft"]);
});

// ── fillGaps ───────────────────────────────────────────────────────────────────────────────────────
test("fillGaps fills only empty spots and never overwrites", () => {
  const a = { price: 100, details: { apn: null, homeType: "Condo" }, taxHistory: [], agent: { name: "A", licenseNumber: "" } };
  const b = { price: 999, details: { apn: "123", homeType: "House" }, taxHistory: [{ year: 2025 }], agent: { name: "B", licenseNumber: "01" }, extra: 5 };
  assert.deepEqual(fillGaps(a, b), {
    price: 100,
    details: { apn: "123", homeType: "Condo" },
    taxHistory: [{ year: 2025 }],
    agent: { name: "A", licenseNumber: "01" },
    extra: 5,
  });
});

test("fillGaps keeps a filled value when the new scrape has nothing", () => {
  assert.deepEqual(fillGaps({ a: 1, b: { c: "x" } }, { a: null, b: null }), { a: 1, b: { c: "x" } });
});

// ── fetchMarketDataListing retry loop ─────────────────────────────────────────────────────────────
test("a complete first scrape is not repeated", async () => {
  queue = [scrape(full())];
  const r = await fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/");
  assert.equal(scrapes, 1);
  assert.equal(r.attempts, 1);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.warnings, []);
});

test("a gap is filled from the next scrape: APN, tax history and license come back", async () => {
  const partial = full();
  partial.details.apn = null;
  partial.taxHistory = [];
  partial.listingAgent.licenseNumber = null;
  queue = [scrape(partial), scrape(full())];
  const r = await fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/");
  assert.equal(scrapes, 2);
  assert.equal(r.marketData.details.apn, "4339015088");
  assert.equal(r.marketData.taxHistory.length, 1);
  assert.equal(r.marketData.listingAgent.licenseNumber, "01177161");
  assert.deepEqual(r.missing, []);
});

test("still missing after every try: stops at maxAttempts and names the field", async () => {
  const noTax = full();
  noTax.taxHistory = [];
  queue = [scrape(noTax), scrape(noTax), scrape(noTax), scrape(noTax)];
  const r = await fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/", { maxAttempts: 3 });
  assert.equal(scrapes, 3);
  assert.deepEqual(r.missing.map((f) => f.key), ["taxHistory"]);
  assert.match(r.warnings.join(" "), /Not found on the market data page \(3 tries\): tax history/);
});

test("a failed scrape is retried instead of failing the import", async () => {
  queue = ["fail", scrape(full())];
  const r = await fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/");
  assert.equal(scrapes, 2);
  assert.equal(r.marketData.address.street, "960 Larrabee St");
});

test("every scrape failing still throws a clear error", async () => {
  queue = ["fail", "fail"];
  await assert.rejects(() => fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/", { maxAttempts: 2 }), /All scraping engines failed/);
});

test("an unreadable page (404) throws the readable-page error", async () => {
  const blank = { address: {}, specs: {} };
  queue = [scrape(blank), scrape(blank)];
  await assert.rejects(() => fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/", { maxAttempts: 2 }), /Could not read property details/);
});

test("photos: a later scrape with more photos wins, a fetch failure is reported", async () => {
  queue = [scrape(full(), { photos: { image: "", otherImages: [] } }), scrape(full())];
  const r = await fetchMarketDataListing("https://www.zillow.com/homedetails/x/1_zpid/");
  assert.deepEqual(r.photoUrls, ["a.jpg", "b.jpg"]);
  assert.deepEqual(r.warnings, []);
});
