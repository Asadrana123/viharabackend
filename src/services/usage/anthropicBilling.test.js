const test = require("node:test");
const assert = require("node:assert/strict");
const { anthropicBilling, windows, centsToUsd } = require("./anthropicBilling");

const row = (key, model, cents, extra = {}) => ({ group: { api_key_id: key, model }, cost: { amount: String(cents), requests: 3 }, ...extra });

function fakeFetch(pages) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    const u = new URL(url);
    if (u.pathname.endsWith("/api_keys")) return { ok: true, json: async () => ({ data: [{ id: "k1", name: "DigitalOcean server", status: "active", partial_key_hint: "sk-ant-api03-AB...yz" }], has_more: false }) };
    const daily = u.searchParams.get("time_bucket_width") === "1d";
    return { ok: true, json: async () => (daily ? pages.daily : pages.total) };
  };
  fn.calls = calls;
  return fn;
}

test("cents strings become dollars", () => {
  assert.equal(centsToUsd("41280.000000"), 412.8);
  assert.equal(centsToUsd(undefined), 0);
});

test("long periods are split into 31-day windows, never before 2026-01-01", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const w = windows(new Date("2026-08-01T05:00:00Z"), now, now);
  assert.equal(w.length, 4);
  assert.equal(w[0][0].toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(w.at(-1)[1].toISOString(), now.toISOString());
  assert.equal(windows(new Date("2025-06-01T00:00:00Z"), new Date("2026-01-05T00:00:00Z"), now)[0][0].toISOString(), "2026-01-01T00:00:00.000Z");
});

test("without an admin key the section says so and calls nothing", async () => {
  const f = fakeFetch({});
  assert.deepEqual(await anthropicBilling(new Date(), new Date(), { key: "", fetchImpl: f }), { configured: false });
  assert.equal(f.calls.length, 0);
});

test("totals the bill by key (named) and model, and by day, with the beta header", async () => {
  const f = fakeFetch({
    total: { data: [row("k1", "claude-opus-5-5", 1200), row("k1", "claude-haiku-5-5", 50), row(null, "claude-sonnet-5-5", 300)], has_more: false, data_refreshed_at: "2026-11-09T11:58:00Z" },
    daily: { data: [{ starting_at: "2026-11-08T00:00:00Z", group: { api_key_id: "k1" }, cost: { amount: "1250" } }, { starting_at: "2026-11-09T00:00:00Z", group: { api_key_id: null }, cost: { amount: "300" } }], has_more: false },
  });
  const now = new Date("2026-11-09T12:00:00Z");
  const b = await anthropicBilling(new Date("2026-11-08T00:00:00Z"), now, { key: "sk-ant-admin01-x", fetchImpl: f, now });
  assert.equal(b.total, 15.5);
  assert.equal(b.keys[0].name, "DigitalOcean server");
  assert.equal(b.keys[0].hint, "sk-ant-api03-AB...yz");
  assert.equal(b.keys[0].usd, 12.5);
  assert.deepEqual(b.keys[0].models.map((m) => m.model), ["claude-opus-5-5", "claude-haiku-5-5"]);
  assert.match(b.keys[1].name, /No API key/);
  assert.equal(b.models[0].model, "claude-opus-5-5");
  assert.deepEqual(b.days.map((d) => [d.day, d.total]), [["2026-11-08", 12.5], ["2026-11-09", 3]]);
  assert.equal(b.days[0].k1, 12.5);
  assert.equal(f.calls[0].headers["anthropic-beta"], "analytics-usage-cost-2026-08-24");
  assert.equal(f.calls[0].headers["x-api-key"], "sk-ant-admin01-x");
});

test("a refused key gives a plain reason", async () => {
  const f = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
  await assert.rejects(anthropicBilling(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-02T00:00:00Z"), { key: "bad", fetchImpl: f, now: new Date("2026-11-09T00:00:00Z") }), /Admin API key/);
});
