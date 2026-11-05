// Tests for scripts/textToorakSaleUpdate.js and services/leads/toorakSaleUpdateText.js (the Nov 15 update text).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run, registrationMatcher, FIRST_SALE } = require("../../scripts/textToorakSaleUpdate");
const { renderSaleUpdate, saleUpdateKeyFor } = require("../leads/toorakSaleUpdateText");
const { toorakFormByKey } = require("../../config/toorakForms");

const DAYTIME = new Date("2026-11-05T20:00:00Z"); // 3 PM Eastern, 12 PM Pacific
const NIGHT = new Date("2026-11-06T03:00:00Z"); // 10 PM Eastern
const BALTIMORE_URL = "https://www.vihara.ai/listing/2529-2531-e-monument-st-baltimore";

const property = (over = {}) => ({
  _id: "lead1", fullName: "jane doe", email: "Jane@X.com", phoneNormalized: "+13135550123",
  toorak: { kind: "property", key: "ml-baltimore", listingUrl: BALTIMORE_URL },
  ...over,
});
const financing = (over = {}) => property({ _id: "lead2", email: "f@x.com", phoneNormalized: "+13135550199", toorak: { kind: "financing", key: "financing-v2", listingUrl: "https://www.vihara.ai/auctions" }, ...over });

function fakeDeps(leads, over = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      loadLeads: async () => leads,
      lookups: async () => ({ contactsByPhone: new Map(), sentByKey: new Map(), phonesAlreadyUpdated: new Set(), registeredFormFor: () => null }),
      consentRequired: async () => false,
      pingRedis: async () => true,
      enqueueOutbound: async (a) => { calls.push(a); return { message: { _id: `m${calls.length}` } }; },
      ...over,
    },
  };
}
const go = (deps, argv = [], clock = DAYTIME) => run({ argv, clock: () => clock, gapMs: 0, log: () => {}, deps });

test("Prajwal's three texts, word for word", () => {
  assert.equal(
    renderSaleUpdate(property()).text,
    `Hey Jane, it's Maya from Vihara. Quick update on 2529-2531 E Monument St, Baltimore: the online sale has moved to Sunday, Nov 15. That gives you an extra week to look at the photos and register: ${BALTIMORE_URL} Questions? Book a 15 min call, no cost: cal.com/vihara-ai-advisor Reply STOP to opt out.`
  );
  assert.equal(
    renderSaleUpdate(financing()).text,
    "Hey Jane, it's Maya from Vihara. Quick update: the online sale for the homes you asked about has moved to Sunday, Nov 15. That's an extra week to sort out financing. Book a 15 min advisor call, no cost: cal.com/vihara-ai-advisor Reply STOP to opt out."
  );
  assert.equal(
    renderSaleUpdate(financing(), { registeredForm: toorakFormByKey("ml-1983-law-st") }).text,
    "Hey Jane, it's Maya from Vihara. Heads up: the online sale for 1983 Law St, New Orleans has moved to Sunday, Nov 15. Your registration still counts, nothing to do. Want to talk it through? cal.com/vihara-ai-advisor Reply STOP to opt out."
  );
});

test("no page link: the link and 'and register' go", () => {
  const r = renderSaleUpdate(property({ toorak: { kind: "property", key: "ml-baltimore", listingUrl: "" } }));
  assert.equal(r.version, "propertyNoLink");
  assert.match(r.text, /look at the photos\. Questions\?/);
  assert.doesNotMatch(r.text, /register|https?:/);
});

test("registrations match by email (any case) or phone, rejected ones don't count, own home first", () => {
  const products = new Map([
    ["p-bal", toorakFormByKey("ml-baltimore")],
    ["p-nola", toorakFormByKey("ml-1983-law-st")],
  ]);
  const match = registrationMatcher(
    [
      { auctionId: "p-nola", email: "jane@x.com", mobilePhone: "", status: "approved" },
      { auctionId: "p-bal", email: "", mobilePhone: "(313) 555-0123", status: "pending" },
      { auctionId: "p-bal", email: "f@x.com", mobilePhone: "", status: "rejected" },
      { auctionId: "other", email: "f@x.com", mobilePhone: "", status: "approved" },
    ],
    products
  );
  assert.equal(match(property(), "+13135550123").key, "ml-baltimore", "own form's home first");
  assert.equal(match(property({ toorak: { kind: "property", key: "ml-lathrup-village" } }), "+10000000000").key, "ml-1983-law-st", "by email");
  assert.equal(match(financing(), "+13135550199"), null, "rejected or not a Toorak home: no match");
});

test("dry run lists the texts and queues nothing", async () => {
  const { deps, calls } = fakeDeps([property(), financing()]);
  const out = await go(deps);
  assert.deepEqual(out.sendable.map((s) => s.version), ["property", "financing"]);
  assert.equal(calls.length, 0);
});

test("--send queues each with its own key, template and batch; registered leads get text 3", async () => {
  const { deps, calls } = fakeDeps([property(), financing()], {
    lookups: async () => ({
      contactsByPhone: new Map(), sentByKey: new Map(), phonesAlreadyUpdated: new Set(),
      registeredFormFor: (lead) => (lead._id === "lead2" ? toorakFormByKey("ml-1983-law-st") : null),
    }),
  });
  const out = await go(deps, ["--send"]);
  assert.equal(out.queued.length, 2);
  assert.equal(calls[0].idempotencyKey, saleUpdateKeyFor("lead1"));
  assert.equal(calls[0].origin.templateKey, "toorak-nov15-update");
  assert.equal(calls[0].origin.batchId, "toorak-nov15-update-2026-11-05");
  assert.equal(calls[0].scheduledFor, undefined);
  assert.match(calls[1].body, /Your registration still counts/);
});

test("every Toorak lead gets it, texted before or not; repeats, same number, opt-outs are skipped", async () => {
  const leads = [property(), property({ _id: "dup" }), financing(), property({ _id: "lead3", phoneNormalized: "+12025550111" }), property({ _id: "lead4", phoneNormalized: "+12025550122" })];
  const { deps } = fakeDeps(leads, {
    lookups: async () => ({
      contactsByPhone: new Map([["+12025550122", { optOut: { isOptedOut: true } }]]),
      sentByKey: new Map([[saleUpdateKeyFor("lead2"), { _id: "x", status: "sent" }]]),
      phonesAlreadyUpdated: new Set(["+12025550111"]),
      registeredFormFor: () => null,
    }),
  });
  const out = await go(deps, ["--send"]);
  assert.deepEqual(out.queued.map((q) => q.id), ["lead1"]);
  const why = Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]));
  assert.match(why.dup, /same phone/);
  assert.match(why.lead2, /already got the update/);
  assert.match(why.lead3, /already got the update/);
  assert.match(why.lead4, /opted out/);
});

test("at night it is held to 9 AM in the lead's time zone", async () => {
  const { deps, calls } = fakeDeps([property()]);
  await go(deps, ["--send"], NIGHT);
  assert.equal(calls[0].scheduledFor.toISOString(), "2026-11-06T14:00:00.000Z");
});

test("nobody gets it once the sale has started", async () => {
  assert.equal(FIRST_SALE, "2026-11-15T11:00:00-05:00");
  const out = await go(fakeDeps([property(), financing()]).deps, ["--send"], new Date("2026-11-15T16:30:00Z"));
  assert.equal(out.sendable.length, 0);
  assert.ok(out.skipped.every((s) => /sale will have started/.test(s.reason)));
});

test("a blocked text is reported, and no Redis means nothing is sent", async () => {
  const blocked = fakeDeps([property()], { enqueueOutbound: async () => ({ message: { _id: "m1" }, blocked: true, reason: "no consent" }) });
  assert.equal((await go(blocked.deps, ["--send"])).blocked.length, 1);
  const noRedis = fakeDeps([property()], { pingRedis: async () => false });
  assert.equal((await go(noRedis.deps, ["--send"])).refused, "redis unreachable");
  assert.equal(noRedis.calls.length, 0);
});
