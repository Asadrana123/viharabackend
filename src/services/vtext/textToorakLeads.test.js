// Tests for scripts/textToorakLeads.js (the one-off text to older Toorak leads).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("../../scripts/textToorakLeads");
const { renderIntro, keyFor } = require("../leads/facebookIntroText");

const DAYTIME = new Date("2026-11-04T20:00:00Z"); // 3 PM Eastern, 12 PM Pacific
const NIGHT = new Date("2026-11-05T03:00:00Z"); // 10 PM Eastern

const toorak = (over = {}) => ({
  _id: "lead1", fullName: "jane doe", phoneNormalized: "+14105550123",
  toorak: { kind: "property", key: "ml-baltimore" },
  ...over,
});
const financing = (over = {}) => toorak({ _id: "lead2", phoneNormalized: "+13135550199", toorak: { kind: "financing", key: "financing-v2" }, ...over });

function fakeDeps(leads, over = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      loadLeads: async () => leads,
      lookups: async () => ({ contactsByPhone: new Map(), sentByKey: new Map(), phonesAlreadyTexted: new Set(), phonesWithAnyText: new Set() }),
      consentRequired: async () => false,
      pingRedis: async () => true,
      enqueueOutbound: async (a) => { calls.push(a); return { message: { _id: `m${calls.length}` } }; },
      ...over,
    },
  };
}
const go = (deps, argv = [], clock = DAYTIME) => run({ argv, clock: () => clock, gapMs: 0, log: () => {}, deps });

test("uses the same text as the automatic Toorak intro (no catch-up wording)", async () => {
  const { deps, calls } = fakeDeps([toorak(), financing()]);
  await go(deps, ["--send"]);
  assert.equal(calls[0].body, renderIntro(toorak(), DAYTIME).text);
  assert.equal(
    calls[0].body,
    "Hey Jane, it's Maya, Vihara's AI assistant. You asked about 2529-2531 E Monument St, Baltimore on Facebook. Still interested? It sells online on Sunday, Nov 15. Reply STOP to opt out."
  );
  assert.equal(calls[1].body, renderIntro(financing(), DAYTIME).text);
  assert.equal(calls[0].origin.templateKey, "toorak-intro");
  assert.doesNotMatch(calls.map((c) => c.body).join(" "), /Sorry/);
});

test("dry run lists the texts and queues nothing", async () => {
  const { deps, calls } = fakeDeps([toorak(), financing()]);
  const out = await go(deps);
  assert.equal(out.sendable.length, 2);
  assert.equal(calls.length, 0);
});

test("--send queues each with the intro key and the batch", async () => {
  const { deps, calls } = fakeDeps([toorak(), financing()]);
  const out = await go(deps, ["--send"]);
  assert.equal(out.queued.length, 2);
  assert.equal(calls[0].idempotencyKey, keyFor("lead1"));
  assert.equal(calls[0].origin.batchId, "toorak-catch-up-2026-11-04");
  assert.equal(calls[0].scheduledFor, undefined, "daytime: goes out now");
});

test("at night it is held to 9 AM in the lead's own time zone", async () => {
  const { deps, calls } = fakeDeps([toorak({ phoneNormalized: "+13135550123" })]); // Detroit: Eastern
  await go(deps, ["--send"], NIGHT);
  assert.equal(calls[0].scheduledFor.toISOString(), "2026-11-05T14:00:00.000Z"); // 9 AM Eastern
});

test("skips leads already texted: the intro, the same number, or any other text from us", async () => {
  const leads = [toorak(), toorak({ _id: "dup" }), financing(), toorak({ _id: "lead3", phoneNormalized: "+12025550111" })];
  const { deps, calls } = fakeDeps(leads, {
    lookups: async () => ({
      contactsByPhone: new Map(),
      sentByKey: new Map([[keyFor("lead2"), { _id: "x", status: "sent" }]]),
      phonesAlreadyTexted: new Set(),
      phonesWithAnyText: new Set(["+12025550111"]),
    }),
  });
  const out = await go(deps, ["--send"]);
  assert.deepEqual(out.queued.map((q) => q.id), ["lead1"]);
  const why = Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]));
  assert.match(why.dup, /same phone/);
  assert.match(why.lead2, /already handled/);
  assert.match(why.lead3, /already texted this number/);
  assert.equal(calls.length, 1);
});

test("an unknown property form, a missing name or a non-US number is skipped", async () => {
  const leads = [
    toorak({ _id: "a", toorak: { kind: "property", key: "ml-nowhere" } }),
    toorak({ _id: "b", fullName: "", firstName: "" }),
    toorak({ _id: "c", phoneNormalized: "+917019236106" }),
  ];
  const out = await go(fakeDeps(leads).deps);
  assert.equal(out.sendable.length, 0);
  assert.equal(out.skipped.length, 3);
});

test("--only and --limit narrow the run", async () => {
  const leads = [toorak(), financing()];
  assert.deepEqual((await go(fakeDeps(leads).deps, ["--only=lead2"])).sendable.map((s) => s.id), ["lead2"]);
  assert.equal((await go(fakeDeps(leads).deps, ["--limit=1"])).sendable.length, 1);
});

test("a blocked text (consent switch ON) is reported, and no Redis means nothing is sent", async () => {
  const blocked = fakeDeps([toorak()], {
    consentRequired: async () => true,
    enqueueOutbound: async () => ({ message: { _id: "m1" }, blocked: true, reason: "no consent" }),
  });
  assert.equal((await go(blocked.deps, ["--send"])).blocked.length, 1);

  const noRedis = fakeDeps([toorak()], { pingRedis: async () => false });
  const out = await go(noRedis.deps, ["--send"]);
  assert.equal(out.refused, "redis unreachable");
  assert.equal(noRedis.calls.length, 0);
});
