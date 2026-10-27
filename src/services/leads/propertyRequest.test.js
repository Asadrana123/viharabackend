const test = require("node:test");
const assert = require("node:assert/strict");
const { requestFrom, sameRequest, requestWords, fitsRequest, applyRequestToBuyBox, reportRow, demandCounts, reportCsv } = require("./propertyRequest");
const { scorePair } = require("../buyerMatch/scoring");

const sfr3 = requestFrom({ types: ["single_family"], bedsMin: 3, condition: "light_work", where: "Baltimore, 21224", notes: "Near transit" });

test("requestFrom keeps known values and drops the rest", () => {
  const r = requestFrom({
    types: ["single_family", "castle", "condo", "condo"],
    bedsMin: 9,
    condition: "haunted",
    where: "x".repeat(200),
    notes: "y".repeat(700),
    purpose: "rental",
    timeline: "1y",
  });
  assert.deepEqual(r.types, ["single_family", "condo"]);
  assert.equal(r.bedsMin, null);
  assert.equal(r.condition, "");
  assert.equal(r.where.length, 120);
  assert.equal(r.notes.length, 600);
  assert.equal(r.purpose, "rental");
  assert.equal(r.timeline, "");
  assert.equal(requestFrom(undefined), null);
  assert.equal(requestFrom("3 beds"), null);
  assert.equal(requestFrom({ bedsMin: "4" }).bedsMin, 4);
  assert.equal(requestFrom({ bedsMin: 2.5 }).bedsMin, null);
});

test("requestWords reads like the report example", () => {
  assert.equal(requestWords(sfr3, "MD"), "3+ bed single-family home in Baltimore, 21224, needs light work");
  assert.equal(requestWords(requestFrom({}), "MD"), "Any property in Maryland");
  assert.equal(requestWords(requestFrom({ types: ["condo"] }), ""), "Condo or townhouse");
});

test("a 3+ bed single-family request never matches a condo or a 2-bed", () => {
  assert.equal(fitsRequest(sfr3, { propertyType: "Single Family", beds: 3 }), true);
  assert.equal(fitsRequest(sfr3, { propertyType: "Single Family", beds: 4 }), true);
  assert.equal(fitsRequest(sfr3, { propertyType: "Single Family", beds: 2 }), false);
  assert.equal(fitsRequest(sfr3, { propertyType: "Condo, Townhouse, other single unit", beds: 3 }), false);
  assert.equal(fitsRequest(sfr3, { propertyType: "Single Family", beds: 0 }), false);
  // Any type: still never land.
  assert.equal(fitsRequest(requestFrom({}), { propertyType: "Land", beds: 0 }), false);
  assert.equal(fitsRequest(requestFrom({}), { propertyType: "Multi-family", beds: 8 }), true);
  assert.equal(fitsRequest(null, { propertyType: "Land" }), true);
});

test("Buyer Match drops pairs that don't fit the request", () => {
  const lead = {
    locations: [{ kind: "state", state: "MD" }],
    budget: null,
    buyerType: null,
    minBeds: 3,
    timing: null,
    registeredSlugs: [],
    auctionRegistrations: [],
    engagement: {},
    request: { types: ["single_family"], bedsMin: 3 },
  };
  const prop = (propertyType, beds) => ({ id: "p", state: "MD", propertyType, beds, price: 100000 });
  assert.ok(scorePair(lead, prop("Single Family", 3)));
  assert.equal(scorePair(lead, prop("Condo, Townhouse, other single unit", 3)), null);
  assert.equal(scorePair(lead, prop("Single Family", 2)), null);
  // Without a request the same lead still sees the condo.
  assert.ok(scorePair({ ...lead, request: null }, prop("Condo, Townhouse, other single unit", 3)));
});

test("sameRequest ignores dates", () => {
  assert.equal(sameRequest({ ...sfr3, requestedAt: new Date(0) }, sfr3), true);
  assert.equal(sameRequest(sfr3, { ...sfr3, bedsMin: 4 }), false);
  assert.equal(sameRequest(null, sfr3), false);
});

test("applyRequestToBuyBox fills only what the form left empty", () => {
  const box = applyRequestToBuyBox({ property_type: [], condition: "" }, requestFrom({ types: ["multi_family"], condition: "move_in" }));
  assert.deepEqual(box.property_type, ["mf_2_4", "mf_5_plus"]);
  assert.equal(box.condition, "turnkey");
  const kept = applyRequestToBuyBox({ property_type: ["sfr"], condition: "any" }, requestFrom({ types: ["condo"], condition: "move_in" }));
  assert.deepEqual(kept.property_type, ["sfr"]);
  assert.equal(kept.condition, "any");
});

test("report rows, counts and CSV", () => {
  const lead = (over) => ({
    _id: over.id,
    fullName: over.name,
    email: `${over.id}@x.com`,
    phone: "+14105550123",
    buyBox: { states: [over.state], price_min: 100000, price_max: 150000, financing: over.cash ? "cash" : "financing" },
    request: { ...sfr3, timeline: over.timeline, requestedAt: new Date() },
    firstTouch: { utm_source: "site" },
  });
  const rows = [
    lead({ id: "a", name: "Ana Diaz", state: "MD", cash: true, timeline: "30d" }),
    lead({ id: "b", name: "Bo Li", state: "MD", cash: false, timeline: "180d" }),
    lead({ id: "c", name: "Cy Ng", state: "LA", cash: true, timeline: "90d" }),
  ].map(reportRow);
  assert.equal(rows[0].wanted, "3+ bed single-family home in Baltimore, 21224, needs light work");
  assert.equal(rows[0].budget, "$100K – $150K");
  assert.equal(rows[0].pay, "Cash");

  const counts = demandCounts(rows);
  assert.deepEqual(counts.state[0], { key: "MD", label: "Maryland", count: 2, cash: 1, within90: 1 });
  assert.deepEqual(counts.type[0], { key: "single_family", label: "Single-family", count: 3, cash: 2, within90: 2 });
  assert.equal(counts.bedrooms[0].label, "3+ beds");
  assert.equal(counts.area[0].label, "Baltimore, MD");

  const csv = reportCsv(rows).split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[0], /"Name","Email","Phone","State","Request"/);
  assert.match(csv[1], /"Ana Diaz"/);
  assert.match(csv[1], /"Near transit"/);
});
