// Tests for scripts/textToorakSaleUpdate.js and services/leads/toorakSaleUpdateText.js (the Nov 15 update text).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run, FIRST_SALE } = require("../../scripts/textToorakSaleUpdate");
const { renderSaleUpdate, buildRecipients, saleUpdateKeyFor } = require("../leads/toorakSaleUpdateText");
const { INTRO_TEMPLATE_KEYS } = require("../leads/facebookIntroText");
const { toorakFormByKey } = require("../../config/toorakForms");

const DAYTIME = new Date("2026-11-05T20:00:00Z"); // 3 PM Eastern, 12 PM Pacific
const NIGHT = new Date("2026-11-06T03:00:00Z"); // 10 PM Eastern
const BALTIMORE_URL = "https://www.vihara.ai/listing/2529-2531-e-monument-st-baltimore";
const P1 = "+13135550123";
const P2 = "+13135550199";
const P3 = "+12125550111";

const property = (over = {}) => ({
  _id: "lead1", fullName: "jane doe", email: "Jane@X.com", phoneNormalized: P1,
  toorak: { kind: "property", key: "ml-baltimore", listingUrl: BALTIMORE_URL },
  ...over,
});
const financing = (over = {}) => property({ _id: "lead2", email: "f@x.com", phoneNormalized: P2, toorak: { kind: "financing", key: "financing-v2", listingUrl: "https://www.vihara.ai/auctions" }, ...over });
const reg = (over = {}) => ({ _id: "reg1", auctionId: "p-nola", firstName: "sam", lastName: "lee", email: "sam@x.com", mobilePhone: "(212) 555-0111", status: "approved", ...over });
const FORMS = new Map([["p-bal", toorakFormByKey("ml-baltimore")], ["p-nola", toorakFormByKey("ml-1983-law-st")]]);

const lookups = (over = {}) => ({
  contactsByPhone: new Map(), sentByKey: new Map(), phonesAlreadyUpdated: new Set(), optedInPhones: new Set([P1, P2, P3]), ...over,
});
function fakeDeps(leads, registrations = [], over = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      loadRecipients: async () => ({ recipients: buildRecipients(leads, registrations, FORMS) }),
      lookups: async () => lookups(),
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
  assert.doesNotMatch(Object.values(require("../leads/toorakSaleUpdateText").SALE_UPDATE_TEMPLATES).join(" "), /\d+(:\d\d)?\s?(AM|PM)/i, "no clock time");
});

test("no page link: the link and 'and register' go", () => {
  const r = renderSaleUpdate(property({ toorak: { kind: "property", key: "ml-baltimore", listingUrl: "" } }));
  assert.equal(r.version, "propertyNoLink");
  assert.match(r.text, /look at the photos\. Questions\?/);
  assert.doesNotMatch(r.text, /register|https?:/);
});

test("the update counts as a first text: the normal intro never follows it", () => {
  assert.ok(INTRO_TEMPLATE_KEYS.includes("toorak-nov15-update"));
});

test("recipients: Toorak leads (registered ones get their home), then registrants who aren't Toorak leads", () => {
  const regs = [
    reg({ _id: "r-own", auctionId: "p-bal", email: "", mobilePhone: "(313) 555-0123" }), // lead1 by phone, own home
    reg({ _id: "r-other", auctionId: "p-nola", email: "JANE@x.com" }),                  // lead1 by email, other home
    reg({ _id: "r-sam" }),                                                               // not a Toorak lead
    reg({ _id: "r-rej", email: "f@x.com", status: "rejected" }),                         // rejected: ignored
    reg({ _id: "r-elsewhere", auctionId: "p-unknown", email: "x@y.com" }),               // not a Toorak home
  ];
  const r = buildRecipients([property(), financing()], regs, FORMS);
  assert.deepEqual(r.map((x) => x.id), ["lead:lead1", "lead:lead2", "registration:r-sam"]);
  assert.equal(r[0].registeredForm.key, "ml-baltimore", "own form's home first");
  assert.equal(r[1].registeredForm, null, "a rejected registration doesn't count");
  assert.equal(r[2].registeredForm.key, "ml-1983-law-st");
  assert.equal(r[2].person.fullName, "sam lee");
});

test("--send: each version, keyed by phone, held to the batch; registered get text 3 only", async () => {
  const { deps, calls } = fakeDeps([property(), financing({ email: "sam@x.com" })], [reg({ email: "sam@x.com" }), reg({ _id: "r2", firstName: "ann", email: "ann@x.com", mobilePhone: "(212) 555-0111" })]);
  const out = await go(deps, ["--send"]);
  assert.deepEqual(out.queued.map((q) => q.id), ["lead:lead1", "lead:lead2", "registration:r2"]);
  assert.match(calls[0].body, /Quick update on 2529-2531 E Monument St/);
  assert.match(calls[1].body, /^Hey Jane.*1983 Law St, New Orleans.*Your registration still counts/, "Toorak lead who registered: text 3 only");
  assert.match(calls[2].body, /^Hey Ann.*Your registration still counts/);
  assert.equal(calls[0].idempotencyKey, saleUpdateKeyFor(P1));
  assert.equal(calls[0].origin.templateKey, "toorak-nov15-update");
  assert.equal(calls[0].origin.batchId, "toorak-nov15-update-2026-11-05");
  assert.deepEqual(calls[0].origin.leadRef, { leadType: "facebookForm", leadId: "lead1" });
  assert.equal(calls[2].origin.leadRef, undefined);
  assert.equal(calls.length, 3);
});

test("switch ON: only people who opted in", async () => {
  const { deps, calls } = fakeDeps([property(), financing()], [reg()], { lookups: async () => lookups({ optedInPhones: new Set([P2]), requireOptIn: true }) });
  const out = await go(deps, ["--send"]);
  assert.deepEqual(out.queued.map((q) => q.id), ["lead:lead2"]);
  const why = Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]));
  assert.match(why["lead:lead1"], /did not opt in/);
  assert.match(why["registration:reg1"], /did not opt in/);
  assert.equal(calls.length, 1);
});

test("switch OFF: everyone, consent or not, but never an opt-out", async () => {
  const { deps, calls } = fakeDeps([property(), financing()], [reg()], {
    lookups: async () => lookups({ optedInPhones: new Set(), requireOptIn: false, contactsByPhone: new Map([[P2, { consent: { status: "opted-out" } }]]) }),
  });
  const out = await go(deps, ["--send"]);
  assert.deepEqual(out.queued.map((q) => q.id), ["lead:lead1", "registration:reg1"]);
  assert.match(out.skipped.find((s) => s.id === "lead:lead2").reason, /opted out/);
  assert.equal(calls.length, 2);
});

test("repeats, the same number twice, and opt-outs are skipped", async () => {
  const leads = [property(), property({ _id: "dup" }), financing(), property({ _id: "lead3", phoneNormalized: P3 })];
  const { deps } = fakeDeps(leads, [], {
    lookups: async () => lookups({
      contactsByPhone: new Map([[P3, { optOut: { isOptedOut: true } }]]),
      sentByKey: new Map([[saleUpdateKeyFor(P2), { _id: "x", status: "sent" }]]),
    }),
  });
  const out = await go(deps, ["--send"]);
  assert.deepEqual(out.queued.map((q) => q.id), ["lead:lead1"]);
  const why = Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]));
  assert.match(why["lead:dup"], /same phone/);
  assert.match(why["lead:lead2"], /already got the update/);
  assert.match(why["lead:lead3"], /opted out/);
});

test("at night it is held to 9 AM in the person's time zone", async () => {
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

test("dry run queues nothing; --only narrows; no Redis means nothing is sent", async () => {
  const dry = fakeDeps([property(), financing()]);
  assert.equal((await go(dry.deps)).sendable.length, 2);
  assert.equal(dry.calls.length, 0);
  assert.deepEqual((await go(fakeDeps([property(), financing()]).deps, ["--only=lead:lead2"])).sendable.map((s) => s.id), ["lead:lead2"]);
  const noRedis = fakeDeps([property()], [], { pingRedis: async () => false });
  assert.equal((await go(noRedis.deps, ["--send"])).refused, "redis unreachable");
  assert.equal(noRedis.calls.length, 0);
});
