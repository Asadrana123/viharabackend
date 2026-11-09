const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { claudeCost, geminiCost, toolName, claudePrice } = require("./prices");
const { trackAnthropic, recordGemini, setSpendSink } = require("./spendRecorder");
const { summarize, periodOf, qaRows } = require("./spendReport");
const { cleanPush } = require("./spendSync");
const { describe } = require("./features");

test("prices a Claude response from its usage, cache and web search included", () => {
  const c = claudeCost("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, server_tool_use: { web_search_requests: 3 } });
  // 4 + 2 + 0.2 + 5 (1.25x write) + 0.03
  assert.equal(c.usd, 11.23);
  assert.equal(c.cacheReadTokens, 1_000_000);
});

test("a dated model id finds its price; an unknown model has none and is not guessed", () => {
  assert.equal(claudePrice("claude-haiku-4-5-20251001").id, "claude-haiku-4-5");
  assert.equal(claudeCost("claude-unknown-9", { input_tokens: 10 }).usd, null);
  assert.equal(geminiCost("gemini-3.8-flash", { promptTokenCount: 10 }).usd, null);
  assert.equal(geminiCost("gemini-2.5-flash", { promptTokenCount: 1_000_000, candidatesTokenCount: 0 }).usd, 0.3);
});

test("names tools plainly", () => {
  assert.equal(toolName("claude-opus-5-5"), "Claude Opus 5.5");
  assert.equal(toolName("claude-haiku-4-5-20251001"), "Claude Haiku 4.5");
  assert.equal(toolName("gemini-2.5-flash"), "Gemini 2.5 Flash");
});

function fakeClient() {
  const message = { model: "claude-sonnet-5-5", usage: { input_tokens: 1000, output_tokens: 500 } };
  const messages = {
    create: async () => message,
    stream() {
      const s = new EventEmitter();
      s.finalMessage = async () => message;
      setImmediate(() => s.emit("finalMessage", message));
      return s;
    },
  };
  return { messages, beta: { messages }, other() { return this; } };
}

test("a tracked client records create and stream calls under its feature, and returns the same answer", async () => {
  const records = [];
  setSpendSink((d) => records.push(d));
  const client = trackAnthropic(fakeClient(), "ga-report");
  const m = await client.messages.create({ model: "x" });
  assert.equal(m.model, "claude-sonnet-5-5");
  const s = client.beta.messages.stream({});
  assert.equal((await s.finalMessage()).usage.output_tokens, 500);
  await new Promise((r) => setImmediate(r));
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.feature), ["ga-report", "ga-report"]);
  assert.equal(records[0].tool, "Claude Sonnet 5.5");
  assert.equal(records[0].usd, 0.007);
  setSpendSink(null);
});

test("a shared client re-tracked under another feature is recorded once, under the new one", async () => {
  const records = [];
  setSpendSink((d) => records.push(d));
  const base = trackAnthropic(fakeClient(), "design-studio");
  await trackAnthropic(base, "landing-mockup").messages.create({});
  assert.deepEqual(records.map((r) => r.feature), ["landing-mockup"]);
  setSpendSink(null);
});

test("a failed call is not recorded and still fails for the caller", async () => {
  const records = [];
  setSpendSink((d) => records.push(d));
  const client = trackAnthropic({ messages: { create: () => Promise.reject(new Error("rate limited")) } }, "x");
  await assert.rejects(client.messages.create({}), /rate limited/);
  assert.equal(records.length, 0);
  setSpendSink(null);
});

test("records a Gemini answer from its usage metadata", () => {
  const records = [];
  setSpendSink((d) => records.push(d));
  recordGemini("vtext-replies", "gemini-2.5-flash", { response: { usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 100, thoughtsTokenCount: 50 } } });
  assert.equal(records[0].outputTokens, 150);
  assert.equal(records[0].provider, "google");
  setSpendSink(null);
});

test("summarizes by feature, tool, person and day, and counts unpriced items apart", () => {
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-11-03T12:00:00Z");
  const rows = [
    { at: new Date("2026-11-01T10:00:00Z"), feature: "video", tool: "Kling", provider: "treg", usd: 1.2, by: "Preetham", source: "creative-os" },
    { at: new Date("2026-11-02T10:00:00Z"), feature: "video", tool: "Claude Opus 5.5", usd: 0.3, by: "Preetham", source: "creative-os" },
    { at: new Date("2026-11-02T11:00:00Z"), feature: "ga-report", tool: "Claude Sonnet 5.5", usd: 0.05, source: "backend" },
    { at: new Date("2026-11-03T11:00:00Z"), feature: "hook-scout", tool: "Claude Opus 5.5", usd: null, source: "creative-os" },
  ];
  const s = summarize(rows, { from, to, tz: "UTC", previousUsd: 1 });
  assert.equal(s.total.usd, 1.55);
  assert.equal(s.total.unpriced, 1);
  assert.equal(s.features[0].key, "video");
  assert.equal(s.features[0].usd, 1.5);
  assert.deepEqual(s.features[0].tools.map((t) => t.tool), ["Kling", "Claude Opus 5.5"]);
  assert.equal(s.people[0].by, "Preetham");
  assert.equal(s.people[1].by, "Automatic (no person)");
  assert.deepEqual(s.days.map((d) => d.day), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.equal(s.days[1].reports, 0.05);
  assert.equal(s.recent[0].usd, null);
  assert.equal(summarize(rows, { from, to, tz: "UTC", feature: "ga-report" }).recent.length, 1);
});

test("periods", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  assert.equal(periodOf({ range: "month" }, now).from.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(periodOf({ range: "lastMonth" }, now).to.toISOString(), "2026-10-31T23:59:59.999Z");
  assert.equal(periodOf({ range: "nonsense" }, now).range, "30d");
  assert.throws(() => periodOf({ from: "2026-11-05", to: "2026-11-01" }), /start date/);
});

test("QA runs count with their own reported cost", () => {
  const rows = qaRows([{ _id: "r1", createdAt: new Date(), costUsd: 0.8, request: "Test sign-up", requestedBy: { name: "Asad" } }, { _id: "r2", costUsd: 0 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].feature, "qa-agent");
});

test("a push is checked item by item and refused whole on a bad one", () => {
  const ok = cleanPush({ items: [{ id: "claude:1", at: "2026-11-09T10:00:00Z", feature: "hook-scout", usd: 0.4, tool: "Claude Opus 5.5" }], balances: [{ provider: "treg", usd: 12.5, at: "2026-11-09T10:00:00Z" }] });
  assert.equal(ok.items[0].extId, "cos:claude:1");
  assert.equal(ok.items[0].source, "creative-os");
  assert.equal(ok.balances[0].usd, 12.5);
  assert.equal(cleanPush({ items: [{ id: "a", at: "2026-11-09", feature: "video", usd: null }] }).items[0].usd, null);
  assert.throws(() => cleanPush({ items: [{ id: "a", at: "2026-11-09", feature: "Video Stuff", usd: 1 }] }), /lowercase/);
  assert.throws(() => cleanPush({ items: [{ id: "a", at: "2026-11-09", feature: "video", usd: -1 }] }), /usd/);
  assert.throws(() => cleanPush({}), /list/);
});

test("an unknown feature still shows, under Other", () => {
  assert.deepEqual(describe("something-new"), { key: "something-new", label: "something-new", about: "", group: "other", groupLabel: "Other" });
});

test("a refusal for want of credits is noted with the feature; other failures are not", async () => {
  const notes = [];
  setSpendSink((d) => notes.push(d));
  const err = Object.assign(new Error("400 Your credit balance is too low to access the Anthropic API."), { status: 400 });
  const client = trackAnthropic({ messages: { create: () => Promise.reject(err) } }, "ga-report");
  await assert.rejects(client.messages.create({}), /credit balance/);
  const other = trackAnthropic({ messages: { create: () => Promise.reject(new Error("overloaded")) } }, "x");
  await assert.rejects(other.messages.create({}), /overloaded/);
  await new Promise((r) => setImmediate(r));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].creditOut.note, "ga-report");
  setSpendSink(null);
});

test("history from the agents' own records counts only before tracking began", () => {
  const { historyRows } = require("./spendReport");
  const cutoff = new Date("2026-11-09T12:00:00Z");
  const rows = historyRows({
    designs: [{ _id: "d1", createdAt: new Date("2026-11-01"), usage: { costUsd: 2.5 }, createdByName: "Asad" }, { _id: "d2", createdAt: new Date("2026-11-10"), usage: { costUsd: 9 } }],
    diagnoses: [{ _id: "c1", createdAt: new Date("2026-10-20"), costUsd: 1.2 }],
    incidents: [{ _id: "r1", createdAt: new Date("2026-10-21"), costUsd: 0 }],
  }, cutoff);
  assert.deepEqual(rows.map((r) => [r.feature, r.usd, r.by]), [["design-studio", 2.5, "Asad"], ["conversion-agent", 1.2, ""]]);
});

test("spend is split by provider", () => {
  const s = summarize([{ at: new Date("2026-11-02T10:00:00Z"), feature: "video", provider: "treg", usd: 1 }, { at: new Date("2026-11-02T10:00:00Z"), feature: "ga-report", provider: "anthropic", usd: 0.5 }], { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-03T00:00:00Z"), tz: "UTC" });
  assert.deepEqual(s.providers.map((p) => [p.provider, p.usd]), [["treg", 1], ["anthropic", 0.5]]);
});
