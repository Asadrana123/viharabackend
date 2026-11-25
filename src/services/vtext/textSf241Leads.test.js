// Tests for scripts/textSf241Leads.js (the one-off 10 AM PT text to the 5 SF leads for 241 10th St).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run, textFor } = require("../../scripts/textSf241Leads");

const BEFORE = new Date("2026-11-25T10:00:00Z"); // 2 AM Pacific, hours before the send time

function fakeDeps(over = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      lookups: async () => ({ byPhone: new Map(), sameKey: new Set(), threads: new Map() }),
      consentRequired: async () => true,
      pingRedis: async () => true,
      enqueueOutbound: async (a) => { calls.push(a); return { message: { _id: `m${calls.length}` } }; },
      ...over,
    },
  };
}
const go = (deps, argv = [], clock = BEFORE, random = () => 0) => run({ argv, clock: () => clock, random, gapMs: 0, log: () => {}, deps });

test("the text has no link and swaps in the first name", () => {
  assert.equal(
    textFor("Leah"),
    "Hi Leah, it's Maya from Vihara. The SF condo you asked about (241 10th St) goes to auction today at 11 AM PT, starting at $795K. Want me to send you the link to register? Reply STOP to opt out."
  );
  assert.doesNotMatch(textFor("Leah"), /vihara\.ai|http/i);
});

test("dry run lists 5 texts and queues nothing", async () => {
  const { deps, calls } = fakeDeps();
  const out = await go(deps);
  assert.equal(out.sendable.length, 5);
  assert.equal(calls.length, 0);
});

test("--send queues all 5, Leah first, at 10:00 AM PT, 3 minutes apart (at the shortest gap)", async () => {
  const { deps, calls } = fakeDeps();
  await go(deps, ["--send"]);
  assert.equal(calls.length, 5);
  assert.equal(calls[0].to, "+16284887448");
  assert.match(calls[0].body, /^Hi Leah,/);
  assert.equal(calls[0].scheduledFor.toISOString(), "2026-11-25T18:00:00.000Z");
  assert.equal(calls[1].scheduledFor.toISOString(), "2026-11-25T18:03:00.000Z");
  assert.equal(new Set(calls.map((c) => c.idempotencyKey)).size, 5);
});

test("skips opted-out numbers, but still texts numbers that already got an earlier text", async () => {
  const { deps, calls } = fakeDeps({
    lookups: async () => ({
      byPhone: new Map([
        ["+14155040959", { _id: "c1", optOut: { isOptedOut: true } }],
        ["+14153689466", { _id: "c2" }],
      ]),
      sameKey: new Set(),
      threads: new Map([["c2", { channelType: "imessage-bluebubbles", lineAddress: "a@b.c", inbound: 0 }]]),
    }),
  });
  const out = await go(deps, ["--send"]);
  assert.equal(calls.length, 4);
  assert.equal(out.skipped.length, 1);
  assert.ok(calls.some((c) => c.to === "+14153689466"));
});

test("a lead whose earlier thread is on Twilio SMS is pinned to Twilio SMS; others are not pinned", async () => {
  const { deps, calls } = fakeDeps({
    lookups: async () => ({
      byPhone: new Map([["+16284887448", { _id: "c1" }], ["+14153689466", { _id: "c2" }]]),
      sameKey: new Set(),
      threads: new Map([["c1", { channelType: "twilio-sms", inbound: 1 }], ["c2", { channelType: "imessage-bluebubbles", inbound: 0 }]]),
    }),
  });
  await go(deps, ["--send"]);
  const leah = calls.find((c) => c.to === "+16284887448");
  const thelma = calls.find((c) => c.to === "+14153689466");
  assert.deepEqual(leah.channelPolicy, { mode: "only", channels: ["twilio-sms"] });
  assert.equal(thelma.channelPolicy, undefined);
});

test("a second run adds nothing (same keys)", async () => {
  const { deps, calls } = fakeDeps({
    lookups: async () => ({ byPhone: new Map(), threads: new Map(), sameKey: new Set(["sf-241-auction-text-16284887448", "sf-241-auction-text-14155040959"]) }),
  });
  await go(deps, ["--send"]);
  assert.equal(calls.length, 3);
});

test("a blocked text (consent switch ON, no consent) is reported, not counted as queued", async () => {
  const { deps } = fakeDeps({ enqueueOutbound: async () => ({ message: { _id: "m" }, blocked: true, reason: "no consent on file" }) });
  const out = await go(deps, ["--send"]);
  assert.equal(out.blocked.length, 5);
  assert.equal(out.queued.length, 0);
});

test("does not queue when Redis is down", async () => {
  const { deps, calls } = fakeDeps({ pingRedis: async () => false });
  const out = await go(deps, ["--send"]);
  assert.equal(out.refused, "redis unreachable");
  assert.equal(calls.length, 0);
});

test("gaps are 3 to 5 minutes, even at the longest", async () => {
  const { deps, calls } = fakeDeps();
  await go(deps, ["--send"], BEFORE, () => 0.999999);
  for (let i = 1; i < calls.length; i++) {
    const gap = calls[i].scheduledFor - calls[i - 1].scheduledFor;
    assert.ok(gap >= 180000 && gap <= 300000, `gap ${gap}`);
  }
  assert.ok(calls[4].scheduledFor <= new Date("2026-11-25T18:20:00Z"));
});
