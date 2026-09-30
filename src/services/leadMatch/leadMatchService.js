// services/leadMatch/leadMatchService.js
//
// Runs every matchable lead against every biddable property once, keeps the
// result in memory for a few minutes, and answers the admin page's queries
// from that snapshot. At current volume (hundreds of properties × thousands of
// leads) a full rebuild is well under a second.

const { loadPropertyProfiles, loadLeadProfiles, SOURCES } = require("./profiles");
const { isMatchable, scorePair } = require("./scoring");

const CACHE_TTL_MS = 5 * 60 * 1000;
// Pairs below this are not worth an advisor's time; never stored.
const STORE_FLOOR = 40;
// A "strong" match — used for the counts on the picker lists.
const STRONG = 70;

let snapshot = null;
let building = null;

async function build() {
  const [properties, allLeads] = await Promise.all([loadPropertyProfiles(), loadLeadProfiles()]);
  const leads = allLeads.filter(isMatchable);
  const now = Date.now();

  const byProperty = new Map(properties.map((p) => [p.id, []]));
  const byLead = new Map(leads.map((l) => [l.key, []]));

  for (const prop of properties) {
    for (const lead of leads) {
      const m = scorePair(lead, prop, now);
      if (!m || m.score < STORE_FLOOR) continue;
      byProperty.get(prop.id).push({ leadKey: lead.key, ...m });
      byLead.get(lead.key).push({ propertyId: prop.id, ...m });
    }
  }
  const byRank = (a, b) => b.rank - a.rank;
  byProperty.forEach((list) => list.sort(byRank));
  byLead.forEach((list) => list.sort(byRank));

  return {
    builtAt: new Date(),
    properties: new Map(properties.map((p) => [p.id, p])),
    leads: new Map(leads.map((l) => [l.key, l])),
    totalLeads: allLeads.length,
    byProperty,
    byLead,
  };
}

async function getSnapshot({ refresh = false } = {}) {
  const fresh = snapshot && Date.now() - snapshot.builtAt.getTime() < CACHE_TTL_MS;
  if (fresh && !refresh) return snapshot;
  // Concurrent requests share one rebuild.
  if (!building) {
    building = build()
      .then((s) => (snapshot = s))
      .finally(() => (building = null));
  }
  return building;
}

// ─── Shaping for the API ───────────────────────────────────────────────────

const publicLead = (l) => ({
  key: l.key,
  leadType: l.leadType,
  leadId: l.leadId,
  sourceLabel: l.sourceLabel,
  name: l.name,
  email: l.email,
  phone: l.phone,
  createdAt: l.createdAt,
  wants: {
    location: l.locationText,
    budget: l.budgetText,
    buyerType: l.buyerTypeText,
    beds: l.minBeds ? `${l.minBeds}+` : "",
    timing: l.timingText,
  },
  connected: l.engagement.connected,
});

const publicProperty = (p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  street: p.street,
  city: p.city,
  state: p.state,
  zipCode: p.zipCode,
  image: p.image,
  price: p.price,
  value: p.value,
  beds: p.beds,
  baths: p.baths,
  squareFootage: p.squareFootage,
  propertyType: p.propertyType,
  assetType: p.assetType,
  occupancyStatus: p.occupancyStatus,
  auctionStartDate: p.auctionStartDate,
  auctionEndDate: p.auctionEndDate,
});

const matchFields = (m) => ({
  score: m.score,
  confidence: m.confidenceLabel,
  reasons: m.reasons,
  concerns: m.concerns,
  breakdown: m.breakdown,
});

const summarize = (list) => ({
  strongMatches: list.filter((m) => m.score >= STRONG).length,
  topScore: list[0]?.score ?? null,
});

// Same person can sign up through several funnels — show them once, under
// their best-ranked entry.
const personKey = (l) =>
  (l.email && l.email.toLowerCase()) || String(l.phone || "").replace(/\D/g, "").slice(-10) || l.key;

function dedupeByPerson(matches, leads) {
  const seen = new Set();
  return matches.filter((m) => {
    const k = personKey(leads.get(m.leadKey));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Queries ───────────────────────────────────────────────────────────────

async function listProperties({ search = "", refresh = false } = {}) {
  const s = await getSnapshot({ refresh });
  const q = search.trim().toLowerCase();
  const rows = [...s.properties.values()]
    .filter((p) => !q || `${p.name} ${p.street} ${p.city} ${p.state} ${p.zipCode}`.toLowerCase().includes(q))
    .map((p) => {
      const matches = dedupeByPerson(s.byProperty.get(p.id), s.leads);
      return { ...publicProperty(p), ...summarize(matches) };
    })
    .sort((a, b) => b.strongMatches - a.strongMatches || (b.topScore ?? 0) - (a.topScore ?? 0));

  return {
    properties: rows,
    stats: {
      properties: s.properties.size,
      matchableLeads: s.leads.size,
      totalLeads: s.totalLeads,
      builtAt: s.builtAt,
    },
  };
}

async function listLeads({ search = "", source = "", page = 1, limit = 50, refresh = false } = {}) {
  const s = await getSnapshot({ refresh });
  const q = search.trim().toLowerCase();
  const rows = [...s.leads.values()]
    .filter((l) => !source || l.leadType === source)
    .filter((l) => !q || `${l.name} ${l.email} ${l.phone} ${l.locationText}`.toLowerCase().includes(q))
    .map((l) => ({ ...publicLead(l), ...summarize(s.byLead.get(l.key)) }))
    .sort((a, b) => b.strongMatches - a.strongMatches || (b.topScore ?? 0) - (a.topScore ?? 0));

  const start = (page - 1) * limit;
  return {
    leads: rows.slice(start, start + limit),
    pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) },
  };
}

async function matchesForProperty(propertyId, { minScore = 50, source = "", limit = 50 } = {}) {
  const s = await getSnapshot();
  const prop = s.properties.get(String(propertyId));
  if (!prop) return null;

  const list = dedupeByPerson(s.byProperty.get(prop.id), s.leads)
    .filter((m) => m.score >= minScore)
    .filter((m) => !source || s.leads.get(m.leadKey).leadType === source);

  return {
    property: publicProperty(prop),
    total: list.length,
    matches: list.slice(0, limit).map((m) => ({ lead: publicLead(s.leads.get(m.leadKey)), ...matchFields(m) })),
  };
}

async function matchesForLead(leadType, leadId, { minScore = 50, limit = 50 } = {}) {
  const s = await getSnapshot();
  const lead = s.leads.get(`${leadType}:${leadId}`);
  if (!lead) return null;

  const list = s.byLead.get(lead.key).filter((m) => m.score >= minScore);
  return {
    lead: publicLead(lead),
    total: list.length,
    matches: list.slice(0, limit).map((m) => ({ property: publicProperty(s.properties.get(m.propertyId)), ...matchFields(m) })),
  };
}

const SOURCE_OPTIONS = SOURCES.map(({ leadType, label }) => ({ value: leadType, label }));

module.exports = { listProperties, listLeads, matchesForProperty, matchesForLead, SOURCE_OPTIONS };
