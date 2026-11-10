// Property Funnel: buildDataset on a small made-up dataset (no database).
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDataset } = require("./buildDataset");

const NOW = new Date("2026-11-09T20:00:00Z"); // 9 Nov, noon Pacific
const P = "401-rensselaer-ave-ogdensburg";
const Q = "1983-law-st-new-orleans";

function inputs(over = {}) {
  return {
    properties: [
      { id: P, address: "401 Rensselaer Ave", city: "Ogdensburg", state: "NY", status: "live", saleDate: new Date("2026-11-12T16:00:00Z"), startingBid: 25000, imageUrl: null },
      { id: Q, address: "1983 Law St", city: "New Orleans", state: "LA", status: "upcoming", saleDate: null, startingBid: null, imageUrl: "https://x.test/a.jpg" },
    ],
    extraLinks: [], ads: [], adDays: [], adLinks: [], adSetStages: [], ga4Rows: [], clarityRows: [], blogPosts: [], socialPosts: [], syncRuns: [],
    leads: [
      // Jane: Meta form lead, registered (her registration has her email in capitals)
      { id: "L1", createdAt: new Date("2026-11-03T18:00:00Z"), name: "Jane Doe", phone: "+14105552291", email: "jane.doe@gmail.com", propertyId: P, kind: "meta_form", utm: {}, adId: null, buyerTypeRaw: "Cash investor" },
      // Sam: property page lead from Google, registered with his phone written differently
      { id: "L2", createdAt: new Date("2026-11-04T18:00:00Z"), name: "Sam Lee", phone: "(504) 555-0100", email: "sam@example.test", propertyId: P, kind: "property_page", utm: { utm_source: "google", utm_medium: "cpc" }, adId: null, buyerTypeRaw: "" },
      // Ann: never contacted
      { id: "L3", createdAt: new Date("2026-11-05T18:00:00Z"), name: "Ann Kim", phone: "+12025550123", email: "ann@example.test", propertyId: Q, kind: "property_page", utm: {}, adId: null, buyerTypeRaw: "" },
      // Too old for a 14-day window, and a property we don't list
      { id: "L4", createdAt: new Date("2026-10-01T18:00:00Z"), name: "Old Lead", phone: "+13035550000", email: "old@example.test", propertyId: P, kind: "property_page", utm: {}, adId: null },
      { id: "L5", createdAt: new Date("2026-11-05T18:00:00Z"), name: "Elsewhere", phone: "+13035550001", email: "x@example.test", propertyId: "not-a-listing", kind: "property_page", utm: {}, adId: null },
    ],
    registrations: [
      { propertyId: P, at: new Date("2026-11-04T20:00:00Z"), userId: "u1", emailKey: "jane.doe@gmail.com", phoneKey: "" },
      { propertyId: P, at: new Date("2026-11-05T20:00:00Z"), userId: "u2", emailKey: "other@example.test", phoneKey: "5045550100" },
      { propertyId: P, at: new Date("2026-11-06T20:00:00Z"), userId: "u3", emailKey: "walkin@example.test", phoneKey: "9995550000" }, // no lead
    ],
    signedUpEmails: new Set(["jane.doe@gmail.com"]),
    contacts: [{ _id: "c1", phoneE164: "+14105552291", optOut: {} }],
    messages: [
      { contactId: "c1", direction: "out", status: "delivered", createdAt: new Date("2026-11-03T18:05:00Z"), origin: { kind: "automation", templateKey: "form-intro" } },
      { contactId: "c1", direction: "in", status: "received", createdAt: new Date("2026-11-03T18:30:00Z"), origin: {} },
      { contactId: "c1", direction: "out", status: "queued", createdAt: new Date("2026-11-03T19:00:00Z"), origin: {} }, // not sent yet
    ],
    calls: [
      { phone: "+15045550100", startedAt: new Date("2026-11-04T19:00:00Z"), durationSeconds: 95, endedReason: "customer-ended-call", transcript: "AI: Hi Sam, this is Maya.\nUser: Yes I'm interested in the property, tell me more about the auction please and the date it starts and how I register for it" },
      { phone: "+15045550100", startedAt: new Date("2026-11-01T19:00:00Z"), durationSeconds: 0, endedReason: "customer-did-not-answer", transcript: "" }, // before Sam's lead
    ],
    emailEvents: [
      { email: "sam@example.test", event: "request", subject: "Welcome", messageId: "m1", date: new Date("2026-11-04T18:01:00Z") },
      { email: "sam@example.test", event: "opened", subject: "Welcome", messageId: "m1", date: new Date("2026-11-04T18:30:00Z") },
      { email: "sam@example.test", event: "click", subject: "Welcome", messageId: "m1", date: new Date("2026-11-04T18:31:00Z") },
    ],
    ...over,
  };
}

const build = (over, days = 14) => buildDataset(inputs(over), { days, now: NOW });

test("AC-9: no full phone number or email anywhere in the response", () => {
  const json = JSON.stringify(build());
  for (const s of ["4105552291", "555-2291", "jane.doe@gmail.com", "sam@example.test", "5045550100", "555-0100", "2025550123"]) {
    assert.ok(!json.includes(s), `found ${s}`);
  }
  const jane = build().leads.find((l) => l.id === "L1");
  assert.equal(jane.phone, "(410) •••-2291");
  assert.equal(jane.email, "j•••@gmail.com");
});

test("leads: only listed properties, only inside the window", () => {
  const ids = build().leads.map((l) => l.id).sort();
  assert.deepEqual(ids, ["L1", "L2", "L3"]);
});

test("registrations match leads on cleaned-up email or phone; one with no lead counts as Direct", () => {
  const d = build();
  const by = Object.fromEntries(d.leads.map((l) => [l.id, l]));
  assert.equal(by.L1.registeredAt, "2026-11-04T20:00:00.000Z"); // email, different case in the registration
  assert.equal(by.L2.registeredAt, "2026-11-05T20:00:00.000Z"); // phone, written differently
  assert.equal(by.L3.registeredAt, null);
  const reg = (ch) => d.propertyDays.filter((r) => r.propertyId === P && r.channel === ch).reduce((s, r) => s + r.registrations, 0);
  assert.equal(reg("Meta ads"), 1);
  assert.equal(reg("Search"), 1);
  assert.equal(reg("Direct"), 1);
});

test("Paid is unknown (null), never 0, everywhere", () => {
  const d = build();
  assert.ok(d.propertyDays.length > 0);
  for (const r of d.propertyDays) { assert.equal(r.paid, null); assert.equal(r.paidAmount, null); }
  for (const l of d.leads) assert.equal(l.paidAt, null);
});

test("visits are unknown (null) until GA4 has synced, then counted from GA4", () => {
  for (const r of build().propertyDays) assert.equal(r.visits, null);
  const d = build({ ga4Rows: [{ date: "2026-11-03", pagePath: `/listing/${P}`, channelGroup: "Paid Social", sourceMedium: "facebook / paid", campaign: "", sessions: 40, engagedSessions: 20, engagementSeconds: 900 }] });
  const meta = d.propertyDays.find((r) => r.propertyId === P && r.date === "2026-11-03" && r.channel === "Meta ads");
  assert.equal(meta.visits, 40);
  const other = d.propertyDays.find((r) => r.propertyId === P && r.date === "2026-11-04");
  assert.equal(other.visits, 0); // GA4 is synced, nothing came that day
});

test("touches: a reply upgrades the text before it; Maya's real conversation is Connected; email keeps its best result", () => {
  const t = build().touches;
  const jane = t.filter((x) => x.leadId === "L1");
  assert.deepEqual(jane.map((x) => [x.kind, x.outcome, x.by, x.template]), [["VText", "Replied", "Automation", "form-intro"]]);
  const sam = t.filter((x) => x.leadId === "L2");
  assert.deepEqual(sam.map((x) => [x.kind, x.outcome]).sort(), [["Call", "Connected"], ["Email", "Clicked"]]);
  assert.equal(sam.find((x) => x.kind === "Call").durationSec, 95);
  assert.equal(sam.find((x) => x.kind === "Email").at, "2026-11-04T18:01:00.000Z"); // the send time, not the click
});

test("a call made before the lead existed doesn't count for that lead", () => {
  const calls = build().touches.filter((x) => x.kind === "Call");
  assert.equal(calls.length, 1);
});

test("AC-8 (our version): not contacted = leads with no text, call or email", () => {
  const d = build();
  const touched = new Set(d.touches.map((t) => t.leadId));
  assert.deepEqual(d.leads.filter((l) => !touched.has(l.id)).map((l) => l.id), ["L3"]);
});

test("a text is placed at the time it was sent, not when it was queued", () => {
  // Queued before Jane came in (18:00), sent after: counts for her, at the send time.
  const d = build({
    messages: [
      { contactId: "c1", direction: "out", status: "delivered", createdAt: new Date("2026-11-03T11:00:00Z"), sentAt: new Date("2026-11-03T18:20:00Z"), origin: { kind: "automation" } },
    ],
  });
  const text = d.touches.find((x) => x.leadId === "L1" && x.kind === "VText");
  assert.equal(text.at, "2026-11-03T18:20:00.000Z");
});

test("an opt-out marks the last text before it", () => {
  const d = build({ contacts: [{ _id: "c1", phoneE164: "+14105552291", optOut: { isOptedOut: true, at: new Date("2026-11-03T18:40:00Z") } }] });
  assert.equal(d.touches.find((x) => x.leadId === "L1").outcome, "Opted out");
});

test("leads per day and channel, sign-ups, and the page basics", () => {
  const d = build();
  assert.equal(d.sample, false);
  assert.equal(d.minDate, "2026-10-27");
  assert.equal(d.maxDate, "2026-11-09");
  const row = d.propertyDays.find((r) => r.propertyId === P && r.date === "2026-11-03" && r.channel === "Meta ads");
  assert.equal(row.leads, 1);
  assert.equal(row.signups, 1);
  assert.equal(row.spend, 0); // Meta row, no ads synced yet
  assert.equal(d.properties.find((p) => p.id === P).saleDate, "2026-11-12");
  assert.deepEqual(d.properties.find((p) => p.id === P).links.map((l) => l.kind), ["listing", "landing", "register"]);
  assert.equal(d.leads.find((l) => l.id === "L1").buyerType, "Investor");
  assert.ok(d.sources.some((s) => s.name === "Dialer" && /hand calls/.test(s.detail)));
});

test("ad spend splits across the properties an ad is linked to", () => {
  const d = build({
    ads: [{ adId: "A1", name: "Ad", campaignId: "C", campaignName: "Camp", adSetId: "S", adSetName: "Set", audience: "", awarenessAuto: "Cold", status: "active", format: "Image", linkUrl: null, thumbnailUrl: null }],
    adLinks: [{ adId: "A1", propertyId: P, linkedBy: "manual" }, { adId: "A1", propertyId: Q, linkedBy: "manual" }],
    adDays: [{ adId: "A1", date: "2026-11-03", spend: 100, impressions: 1000, clicks: 50, landingPageViews: null, metaLeads: 4 }],
    adSetStages: [{ adSetId: "S", awareness: "Warm" }],
  });
  const spend = (pid) => d.propertyDays.filter((r) => r.propertyId === pid && r.channel === "Meta ads").reduce((s, r) => s + (r.spend || 0), 0);
  assert.equal(spend(P), 50);
  assert.equal(spend(Q), 50);
  assert.equal(d.ads[0].awareness, "Warm");
  assert.equal(d.ads[0].awarenessGuessed, false);
  assert.equal(d.ads[0].propertyLink, "ad_property table");
  assert.deepEqual(d.checks[0], { label: "Meta spend linked to a property", aLabel: "All Meta spend", a: 100, bLabel: "Linked to a property", b: 100 });
  assert.equal(d.adDays[0].paid, null);
});

test("an ad set's tier is marked guessed until marketing sets it", () => {
  const d = build({
    ads: [{ adId: "A1", name: "Ad", campaignId: "C", campaignName: "Camp", adSetId: "S", adSetName: "Toorak Retargeting", audience: "", awarenessAuto: "Warm", status: "active", format: "Image", linkUrl: null, thumbnailUrl: null }],
  });
  assert.equal(d.ads[0].awareness, "Warm");
  assert.equal(d.ads[0].awarenessGuessed, true);
});

test("a registration with no lead counts on its own UTM (saved from 9 Nov 2026)", () => {
  const regs = inputs().registrations.concat([
    { propertyId: Q, at: new Date("2026-11-07T20:00:00Z"), userId: "u4", emailKey: "new@example.test", phoneKey: "", utm: { utm_source: "facebook", utm_medium: "paid_social", ad_id: "A9" } },
  ]);
  const d = build({ registrations: regs });
  const row = d.propertyDays.find((r) => r.propertyId === Q && r.date === "2026-11-07");
  assert.equal(row.channel, "Meta ads");
  assert.equal(row.registrations, 1);
});
