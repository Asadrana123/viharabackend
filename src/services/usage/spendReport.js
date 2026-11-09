// services/usage/spendReport.js
/**
 * The admin page's AI Spend tab: what was spent on AI, by feature, tool, person and day, for a period.
 *
 * Reads the spend records (model/usage/aiSpendModel.js) and the QA agent's runs, which report their own
 * cost (model/qa/qaRunModel.js). summarize() is pure, so it is tested without a database.
 */
const { describe, GROUPS } = require("./features");

const RANGES = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };
const MAX_ROWS = 200000;
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/** What isn't counted, so the total is never read as everything. Shown on the page. */
const NOT_TRACKED = [
  "Claude Code on the editors' and the team's own laptops (their own plans or keys).",
  "Gemini embeddings for the Vtext knowledge base (the API reports no tokens; a few cents a month).",
  "Twilio texts, Vapi and voice calls, HeyGen avatars outside videos, Higgsfield images: billed by those services, not recorded here.",
  "Before 2026-11-09: only what features saved themselves (video assets and Claude runs, designs, /image, cast, Design Studio, Conversion and Repair agents, QA runs). The Slack bot's other Claude runs (hook scout, LinkedIn, proposals) were not recorded before then.",
  "Anthropic's own bill by API key: Anthropic gives it only to organization accounts with an Admin key; the account is an individual one.",
];

/** The period asked for: range=7d|30d|90d|1d|month|lastMonth, or from/to dates (YYYY-MM-DD). */
function periodOf({ range, from, to } = {}, now = new Date()) {
  if (from || to) {
    const start = from ? new Date(`${from}T00:00:00Z`) : new Date(now.getTime() - 30 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999Z`) : now;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error("Choose a start date before the end date.");
    return { from: start, to: end, range: "custom" };
  }
  if (range === "month" || range === "lastMonth") {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() - (range === "lastMonth" ? 1 : 0);
    const start = new Date(Date.UTC(y, m, 1));
    const end = range === "month" ? now : new Date(Date.UTC(y, m + 1, 1) - 1);
    return { from: start, to: end, range };
  }
  const days = RANGES[range] || 30;
  return { from: new Date(now.getTime() - days * 864e5), to: now, range: RANGES[range] ? range : "30d" };
}

function dayOf(date, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

/** Every day in the period, so a day with no spend shows as zero rather than vanishing from the chart. */
function daysBetween(from, to, tz) {
  const out = [];
  const seen = new Set();
  for (let t = from.getTime(); t <= to.getTime() + 864e5; t += 864e5 / 2) {
    if (t > to.getTime()) break;
    const d = dayOf(new Date(t), tz);
    if (!seen.has(d)) seen.add(d), out.push(d);
  }
  const last = dayOf(to, tz);
  if (!seen.has(last)) out.push(last);
  return out;
}

function bump(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}

/**
 * rows: spend records (plain objects). Returns the page's numbers.
 * previousUsd: the total of the period of the same length just before, for the comparison.
 */
function summarize(rows, { from, to, tz = "Asia/Kolkata", previousUsd = null, feature = null, recentLimit = 150 } = {}) {
  const features = new Map();
  const tools = new Map();
  const people = new Map();
  const groups = new Map();
  const providers = new Map();
  const days = new Map(daysBetween(from, to, tz).map((d) => [d, { day: d, total: 0 }]));
  let usd = 0;
  let calls = 0;
  let unpriced = 0;

  for (const r of rows) {
    const cost = typeof r.usd === "number" ? r.usd : null;
    const f = describe(r.feature);
    calls++;
    if (cost === null) unpriced++;
    usd += cost || 0;

    const fe = bump(features, f.key, () => ({ ...f, usd: 0, calls: 0, unpriced: 0, inputTokens: 0, outputTokens: 0, lastAt: null, tools: new Map() }));
    fe.usd += cost || 0;
    fe.calls++;
    if (cost === null) fe.unpriced++;
    fe.inputTokens += (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0);
    fe.outputTokens += r.outputTokens || 0;
    if (!fe.lastAt || r.at > fe.lastAt) fe.lastAt = r.at;
    fe.tools.set(r.tool || "Other", (fe.tools.get(r.tool || "Other") || 0) + (cost || 0));

    const to_ = bump(tools, r.tool || "Other", () => ({ tool: r.tool || "Other", provider: r.provider || "", usd: 0, calls: 0, unpriced: 0 }));
    to_.usd += cost || 0;
    to_.calls++;
    if (cost === null) to_.unpriced++;

    const pv = bump(providers, r.provider || "anthropic", () => ({ provider: r.provider || "anthropic", usd: 0, calls: 0 }));
    pv.usd += cost || 0;
    pv.calls++;

    const g = bump(groups, f.group, () => ({ group: f.group, label: f.groupLabel, usd: 0, calls: 0 }));
    g.usd += cost || 0;
    g.calls++;

    const who = r.by || "Automatic (no person)";
    const p = bump(people, who, () => ({ by: who, usd: 0, calls: 0 }));
    p.usd += cost || 0;
    p.calls++;

    const d = days.get(dayOf(new Date(r.at), tz));
    if (d) {
      d.total += cost || 0;
      d[f.group] = (d[f.group] || 0) + (cost || 0);
    }
  }

  const byUsd = (a, b) => b.usd - a.usd || b.calls - a.calls;
  const recent = rows
    .filter((r) => !feature || r.feature === feature)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, recentLimit)
    .map((r) => ({
      at: r.at,
      feature: r.feature,
      featureLabel: describe(r.feature).label,
      what: r.what || "",
      tool: r.tool || "",
      model: r.model || "",
      usd: typeof r.usd === "number" ? round4(r.usd) : null,
      inputTokens: (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0),
      outputTokens: r.outputTokens || 0,
      by: r.by || "",
      ref: r.ref || "",
      source: r.source,
    }));

  return {
    from,
    to,
    tz,
    total: { usd: round2(usd), calls, unpriced, previousUsd: previousUsd === null ? null : round2(previousUsd) },
    groups: [...groups.values()].map((g) => ({ ...g, usd: round2(g.usd) })).sort(byUsd),
    providers: [...providers.values()].map((p) => ({ ...p, usd: round2(p.usd) })).sort(byUsd),
    features: [...features.values()]
      .map((f) => ({ ...f, usd: round2(f.usd), tools: [...f.tools].map(([tool, u]) => ({ tool, usd: round2(u) })).sort((a, b) => b.usd - a.usd) }))
      .sort(byUsd),
    tools: [...tools.values()].map((t) => ({ ...t, usd: round2(t.usd) })).sort(byUsd),
    people: [...people.values()].map((p) => ({ ...p, usd: round2(p.usd) })).sort(byUsd),
    days: [...days.values()].map((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "number" ? round4(v) : v]))),
    groupLabels: GROUPS,
    recent,
    notTracked: NOT_TRACKED,
  };
}

/** QA agent runs as spend rows: each run reports its own total. */
function qaRows(runs) {
  return runs
    .filter((r) => typeof r.costUsd === "number" && r.costUsd > 0)
    .map((r) => ({ at: r.createdAt, source: "backend", feature: "qa-agent", provider: "anthropic", tool: "Claude (QA agent)", usd: r.costUsd, what: String(r.request || "").slice(0, 120), by: r.requestedBy?.name || "", ref: String(r._id) }));
}

/**
 * Claude spend the backend's agents saved on their own records before every call was tracked: Design Studio
 * requests, conversion diagnoses and repair incidents. Only records from before tracking began (cutoff), since
 * their later calls are already in AiSpend.
 */
function historyRows({ designs = [], diagnoses = [], incidents = [] }, cutoff) {
  const before = (d) => d && new Date(d) < cutoff;
  const row = (feature, at, usd, what, by, ref) => ({ at, source: "backend", feature, provider: "anthropic", tool: "Claude (saved by the feature)", usd, what, by: by || "", ref: String(ref || "") });
  return [
    ...designs.filter((d) => d.usage?.costUsd > 0 && before(d.createdAt)).map((d) => row("design-studio", d.createdAt, d.usage.costUsd, "Design request", d.createdByName, d._id)),
    ...diagnoses.filter((d) => d.costUsd > 0 && before(d.createdAt)).map((d) => row("conversion-agent", d.createdAt, d.costUsd, "Conversion diagnosis", "", d._id)),
    ...incidents.filter((d) => d.costUsd > 0 && before(d.createdAt)).map((d) => row("repair-agent", d.createdAt, d.costUsd, "Repair incident", "", d._id)),
  ];
}

/** When the backend began recording every call: its first record, or now if it has none yet. */
async function trackingStart() {
  const { AiSpend } = require("../../model/usage/aiSpendModel");
  const first = await AiSpend.findOne({ source: "backend" }).sort({ at: 1 }).select("at").lean();
  return first ? new Date(first.at) : new Date();
}

async function loadRows(from, to) {
  const { AiSpend } = require("../../model/usage/aiSpendModel");
  const QaRun = require("../../model/qa/qaRunModel");
  const Design = require("../../model/design/designRequestModel");
  const Diagnosis = require("../../model/conversion/conversionDiagnosisModel");
  const Incident = require("../../model/repair/repairIncidentModel");
  const range = { $gte: from, $lte: to };
  const [spend, runs, designs, diagnoses, incidents, cutoff] = await Promise.all([
    AiSpend.find({ at: range }).select("-_id -__v -createdAt -updatedAt -extId").limit(MAX_ROWS).lean(),
    QaRun.find({ createdAt: range, costUsd: { $gt: 0 } }).select("request requestedBy costUsd createdAt").lean(),
    Design.find({ createdAt: range, "usage.costUsd": { $gt: 0 } }).select("usage.costUsd createdAt createdByName").lean(),
    Diagnosis.find({ createdAt: range, costUsd: { $gt: 0 } }).select("costUsd createdAt").lean(),
    Incident.find({ createdAt: range, costUsd: { $gt: 0 } }).select("costUsd createdAt").lean(),
    trackingStart(),
  ]);
  return [...spend, ...qaRows(runs), ...historyRows({ designs, diagnoses, incidents }, cutoff)];
}

async function previousTotal(from, to) {
  const span = to.getTime() - from.getTime();
  const rows = await loadRows(new Date(from.getTime() - span), new Date(from.getTime() - 1));
  return rows.reduce((n, r) => n + (typeof r.usd === "number" ? r.usd : 0), 0);
}

/** The whole report for the admin page. */
async function spendReport(query = {}) {
  const { AiBalance } = require("../../model/usage/aiSpendModel");
  const period = periodOf(query);
  const tz = typeof query.tz === "string" && query.tz ? query.tz : "Asia/Kolkata";
  const [rows, prev, balances] = await Promise.all([loadRows(period.from, period.to), previousTotal(period.from, period.to), AiBalance.find().select("provider usd at note -_id").lean()]);
  const feature = typeof query.feature === "string" && query.feature ? query.feature : null;
  return { range: period.range, ...summarize(rows, { from: period.from, to: period.to, tz, previousUsd: prev, feature }), balances };
}

module.exports = { summarize, periodOf, qaRows, historyRows, spendReport, NOT_TRACKED };
