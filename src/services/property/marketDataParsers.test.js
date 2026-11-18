// node --test src/services/property/marketDataParsers.test.js
// Cases taken from real Zillow pages that lost data (Nov 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const { processMarketDataResponse } = require("./parsers/marketDataDetailsParser");
const { parseMarketDataPropertyJson } = require("./parsers/marketDataPropertyJsonParser");

test("tax rows with an empty assessment are kept (5643 Chew Ave)", () => {
  const markdown = [
    "## Public tax history",
    "",
    "| Year | Property taxes | Tax assessment |",
    "| --- | --- | --- |",
    "| 2025 | $1,607 -1.8% | $114,800 -1.8% |",
    "| 2022 | $1,519 | \\-\\- |",
    "| 2021 | $1,519 +0.9% | \\-\\- |",
    "| 2026 | \\-\\- | $204,409 |",
    "| 2000 | \\-\\- | \\-\\- |",
    "",
    "## BuyAbility",
  ].join("\n");
  const r = processMarketDataResponse({ data: { markdown } });
  assert.deepEqual(
    r.taxHistory.map((t) => [t.year, t.propertyTax, t.taxAssessment]),
    [[2025, 1607, 114800], [2022, 1519, null], [2021, 1519, null], [2026, null, 204409]]
  );
});

// A minimal page: the property JSON the parser looks for, plus the rendered history text.
const page = (bodyText) => {
  const property = { zpid: 1, streetAddress: "5401 Pine St", city: "Philadelphia", state: "PA", zipcode: "19143", homeStatus: "FOR_SALE" };
  const cache = JSON.stringify({ "x": { property } });
  const nextData = JSON.stringify({ props: { pageProps: { componentProps: { gdpClientCache: cache } } } });
  return `<html><body><div>${bodyText}</div><script id="__NEXT_DATA__" type="application/json">${nextData}</script></body></html>`;
};

test("tax and price history are read from the page HTML when the JSON has none (5401 Pine St)", () => {
  const html = page(
    "<h2>Price history</h2><table><tr><th>Date</th><th>Event</th><th>Price</th></tr>" +
      "<tr><td>5/30/2023</td><td>Sold</td><td>$107,000 -23% $51/sqft</td></tr>" +
      "<tr><td>4/14/2023</td><td>Listed for sale</td><td>$139,000 $67/sqft</td></tr></table><button>Show more</button>" +
      "<h2>Public tax history</h2><table><tr><th>Year</th><th>Property taxes</th><th>Tax assessment</th></tr>" +
      "<tr><td>2025</td><td>$2,716 -15.5%</td><td>$194,000 -15.5%</td></tr>" +
      "<tr><td>2022</td><td>$1,519</td><td>--</td></tr></table><button>Show more</button>"
  );
  const r = parseMarketDataPropertyJson(html);
  assert.ok(r, "property JSON found");
  assert.deepEqual(r.taxHistory.map((t) => [t.year, t.propertyTax, t.taxAssessment]), [[2025, 2716, 194000], [2022, 1519, null]]);
  assert.deepEqual(r.priceHistory.map((p) => [p.date, p.event, p.price, p.pricePerSqft]), [
    ["5/30/2023", "Sold", 107000, 51],
    ["4/14/2023", "Listed for sale", 139000, 67],
  ]);
});
