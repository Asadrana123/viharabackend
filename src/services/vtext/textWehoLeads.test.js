// Tests for scripts/textWehoLeads.js (the one-off follow-up text to the WeHo leads for 960 Larrabee St).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run, textFor, priceWord, dateWord } = require("../../scripts/textWehoLeads");

const NOW = new Date("2026-11-30T20:00:00Z"); // noon Pacific, 3 PM Eastern: inside the hours everywhere
const PRODUCT = { slug: "960-larrabee-st-west-hollywood", productName: "960 Larrabee St", auctionStartDate: new Date("2026-12-06T19:00:00Z"), auctionEndDate: new Date("2026-12-06T23:15:00Z"), startBid: 450000 };
const lead = (n, phone, over = {}) => ({ _id: `l${n}`, fullName: `${["Ann","Ben","Cara","Dev","Eli"][n-1]} Smith`, phone, phoneNormalized: phone, email: `p${n}@x.com`, from: "property page", createdAt: new Date(2026, 10, n), ...over });
const LEADS = [lead(1, "+14155550101"), lead(2, "+12125550102", { from: "Facebook form WeHo ad" }), lead(3, "+13105550103")];

function fakeDeps(over = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      loadProduct: async () => PRODUCT,
      loadLeads: async () => LEADS,
      lookups: async () => ({ byPhone: new Map(), sameKey: new Set(), threads: new Map() }),
      consentRequired: async () => true,
      pingRedis: async () => true,
      enqueueOutbound: async (a) => { calls.push(a); return { message: { _id: `m${calls.length}` } }; },
      ...over,
    },
  };
}
const go = (deps, argv = [], random = () => 0) => run({ argv, clock: () => NOW, random, gapMs: 0, log: () => {}, deps });

test("the text names the date and starting price from the product, with no time and no link", () => {
  const t = textFor({ first: "Leah", startDate: PRODUCT.auctionStartDate, startBid: 450000 });
  assert.equal(t, "Hi Leah, it's Maya from Vihara. The West Hollywood condo you asked about (960 Larrabee St) goes to auction on Dec 6, starting at $450K. Want me to send you the link to register? Reply STOP to opt out.");
  assert.doesNotMatch(t, /AM|PM|PT|http|vihara\.ai/);
});

test("no starting bid: the price part is left out", () => {
  const t = textFor({ first: "Leah", startDate: PRODUCT.auctionStartDate, startBid: null });
  assert.match(t, /goes to auction on Dec 6\. Want me/);
});

test("price and date words", () => {
  assert.equal(priceWord(450000), "$450K");
  assert.equal(priceWord(1250000), "$1.25M");
  assert.equal(priceWord(0), null);
  assert.equal(dateWord(new Date("2026-12-07T05:00:00Z")), "Dec 6"); // still Dec 6 in California
});

test("dry run lists everyone and queues nothing", async () => {
  const { deps, calls } = fakeDeps();
  const out = await go(deps);
  assert.equal(out.sendable.length, 3);
  assert.equal(calls.length, 0);
});

test("--send queues each person once, 3 minutes apart at the shortest gap, with a fixed key", async () => {
  const { deps, calls } = fakeDeps();
  await go(deps, ["--send"]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].scheduledFor.toISOString(), NOW.toISOString());
  assert.equal(calls[1].scheduledFor - calls[0].scheduledFor, 180000);
  assert.equal(calls[0].idempotencyKey, "weho-960-larrabee-auction-text-14155550101");
  assert.equal(calls[0].origin.templateKey, "weho-960-larrabee-auction-text");
});

test("the same phone on a property page and a Facebook form is texted once", async () => {
  const { deps, calls } = fakeDeps({ loadLeads: async () => [lead(1, "+14155550101"), lead(2, "(415) 555-0101", { from: "Facebook form WeHo ad" })] });
  const out = await go(deps, ["--send"]);
  assert.equal(calls.length, 1);
  assert.equal(out.skipped.length, 1);
});

test("skips opt-outs, bad numbers, non-US numbers and leads with no usable first name; still texts people with an earlier text", async () => {
  const { deps, calls } = fakeDeps({
    loadLeads: async () => [lead(1, "+14155550101"), lead(2, "+12125550102"), lead(3, "+442079460958"), lead(4, "+13105550104", { fullName: "J. 123" }), lead(5, "+16465550105")],
    lookups: async () => ({
      byPhone: new Map([
        ["+14155550101", { _id: "c1", optOut: { isOptedOut: true } }],
        ["+12125550102", { _id: "c2", phoneStatus: "bad" }],
        ["+16465550105", { _id: "c5" }],
      ]),
      sameKey: new Set(),
      threads: new Map([["c5", { channelType: "imessage-bluebubbles", lineAddress: "a@b.c", inbound: 2 }]]),
    }),
  });
  const out = await go(deps, ["--send"]);
  assert.deepEqual(calls.map((c) => c.to), ["+16465550105"]);
  assert.equal(out.skipped.length, 4);
});

test("a lead whose earlier thread is on Twilio SMS is pinned to Twilio SMS; others are not pinned", async () => {
  const { deps, calls } = fakeDeps({
    lookups: async () => ({
      byPhone: new Map([["+14155550101", { _id: "c1" }], ["+12125550102", { _id: "c2" }]]),
      sameKey: new Set(),
      threads: new Map([["c1", { channelType: "twilio-sms", inbound: 1 }], ["c2", { channelType: "imessage-bluebubbles", inbound: 0 }]]),
    }),
  });
  await go(deps, ["--send"]);
  assert.deepEqual(calls.find((c) => c.to === "+14155550101").channelPolicy, { mode: "only", channels: ["twilio-sms"] });
  assert.equal(calls.find((c) => c.to === "+12125550102").channelPolicy, undefined);
});

test("a second run adds nothing for numbers that already have the key", async () => {
  const { deps, calls } = fakeDeps({
    lookups: async () => ({ byPhone: new Map(), threads: new Map(), sameKey: new Set(["weho-960-larrabee-auction-text-14155550101"]) }),
  });
  await go(deps, ["--send"]);
  assert.equal(calls.length, 2);
});

test("--limit takes the first N and leaves the rest for a later run", async () => {
  const { deps, calls } = fakeDeps();
  const out = await go(deps, ["--send", "--limit=2"]);
  assert.equal(calls.length, 2);
  assert.equal(out.skipped.length, 1);
});

test("a text is held until 9 AM in the lead's time zone, and the next person follows a gap after it", async () => {
  const { deps, calls } = fakeDeps();
  const late = new Date("2026-12-01T04:30:00Z"); // 11:30 PM Eastern, 8:30 PM Pacific: both past 8 PM
  await run({ argv: ["--send"], clock: () => late, random: () => 0, gapMs: 0, log: () => {}, deps });
  assert.equal(calls[0].scheduledFor.toISOString(), "2026-12-01T17:00:00.000Z"); // 9 AM Pacific (the 415 lead)
  assert.ok(calls[1].scheduledFor - calls[0].scheduledFor >= 180000);
});

test("a blocked text (consent switch ON, no consent) is reported, not counted as queued", async () => {
  const { deps } = fakeDeps({ enqueueOutbound: async () => ({ message: { _id: "m" }, blocked: true, reason: "no consent on file" }) });
  const out = await go(deps, ["--send"]);
  assert.equal(out.blocked.length, 3);
  assert.equal(out.queued.length, 0);
});

test("does not queue when Redis is down", async () => {
  const { deps, calls } = fakeDeps({ pingRedis: async () => false });
  const out = await go(deps, ["--send"]);
  assert.equal(out.refused, "redis unreachable");
  assert.equal(calls.length, 0);
});

test("refuses to run when the auction is over or has no date", async () => {
  await assert.rejects(go(fakeDeps({ loadProduct: async () => ({ ...PRODUCT, auctionEndDate: new Date("2026-11-01T00:00:00Z") }) }).deps), /already over/);
  await assert.rejects(go(fakeDeps({ loadProduct: async () => ({ slug: "x" }) }).deps), /no auction date/);
  await assert.rejects(go(fakeDeps({ loadProduct: async () => null }).deps), /No product/);
});
