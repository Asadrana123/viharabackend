// services/buyerMatch/buyerMatchService.js
//
// Runs every matchable buyer (lead) against every biddable property once,
// keeps the result in memory for a few minutes, and answers the admin page's
// queries from that snapshot. At current volume (hundreds of properties ×
// thousands of leads) a full rebuild takes a couple of seconds.
//
// Three ways in:
//   • by property — best buyers for one property
//   • by buyer    — best properties for one buyer
//   • by seller   — best buyers across every property a seller owns
// Every query can be narrowed to buyers who signed up in a date range.

const User = require("../../model/users/userModel");
const { loadPropertyProfiles, loadLeadProfiles, SOURCES } = require("./profiles");
const { isMatchable, scorePair } = require("./scoring");
const { attachActivity, getLeadActivity } = require("./activity");

const CACHE_TTL_MS = 5 * 60 * 1000;
// Pairs below this are not worth an advisor's time; never stored.
const STORE_FLOOR = 40;
// A "strong" match — used for the counts on the picker lists.
const STRONG = 70;

const MODEL_BY_TYPE = Object.fromEntries(SOURCES.map((s) => [s.leadType, s.model]));

let snapshot = null;
let building = null;

async function loadSellers(properties) {
  const ids = [...new Set(properties.flatMap((p) => p.sellerIds))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select("name email").lean();
  return new Map(
    users.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        name: (u.name || u.email || "Unnamed seller").trim(),
        email: u.email || "",
        propertyIds: properties.filter((p) => p.sellerIds.includes(String(u._id))).map((p) => p.id),
      },
    ])
  );
}

async function build() {
  const [properties, allLeads] = await Promise.all([loadPropertyProfiles(), loadLeadProfiles()]);
  const leads = allLeads.filter(isMatchable);
  const [sellers] = await Promise.all([loadSellers(properties), attachActivity(leads)]);
  const now = Date.now();

  const byProperty = new Map(properties.map((p) => [p.id, []]));
  const byLead = new Map(leads.map((l) => [l.key, []]));

  for (const prop of properties) {
    for (const lead of leads) {
      const m = scorePair(lead, prop, now);
      if (!m || m.score < STORE_FLOOR) continue;
      byProperty.get(prop.id).push({ leadKey: lead.key, propertyId: prop.id, ...m });
      byLead.get(lead.key).push({ leadKey: lead.key, propertyId: prop.id, ...m });
    }
  }
  const byRank = (a, b) => b.rank - a.rank;
  byProperty.forEach((list) => list.sort(byRank));
  byLead.forEach((list) => list.sort(byRank));

  return {
    builtAt: new Date(),
    properties: new Map(properties.map((p) => [p.id, p])),
    leads: new Map(leads.map((l) => [l.key, l])),
    sellers,
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

// ─── Filters ───────────────────────────────────────────────────────────────

/**
 * Signup-date filter. `from` / `to` are "YYYY-MM-DD" (either may be empty);
 * `to` includes that whole day.
 */
function signupFilter({ from, to } = {}) {
  const start = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  if (Number.isNaN(start) || Number.isNaN(end)) return () => true;
  if (start == null && end == null) return () => true;
  return (lead) => {
    const t = lead.createdAt ? new Date(lead.createdAt).getTime() : null;
    if (t == null) return false;
    return (start == null || t >= start) && (end == null || t <= end);
  };
}

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

/** How many different people appear across several match lists. */
function countPeople(lists, leads) {
  const people = new Set();
  for (const list of lists) for (const m of list) people.add(personKey(leads.get(m.leadKey)));
  return people.size;
}

/** One property's buyer list after date / source / score filters. */
function buyersFor(s, propertyId, { inRange, source = "", minScore = 0 }) {
  return dedupeByPerson(
    s.byProperty.get(propertyId).filter((m) => {
      const lead = s.leads.get(m.leadKey);
      return m.score >= minScore && inRange(lead) && (!source || lead.leadType === source);
    }),
    s.leads
  );
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
  callingStopped: l.engagement.callingStopped,
  calls: l.calls,
  emails: l.emails,
  auctionRegistrations: l.auctionRegistrations.length,
});

const publicProperty = (p, s) => ({
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
  sellers: p.sellerIds.map((id) => s.sellers.get(id)?.name).filter(Boolean),
});

/** Score fields + whether this buyer registered for THIS property's auction. */
function matchFields(m, s) {
  const lead = s.leads.get(m.leadKey);
  const reg = lead.auctionRegistrations.find((r) => r.propertyId === m.propertyId);
  return {
    score: m.score,
    confidence: m.confidenceLabel,
    reasons: m.reasons,
    concerns: m.concerns,
    breakdown: m.breakdown,
    auctionRegistration: reg ? { status: reg.status, at: reg.at } : null,
  };
}

const summarize = (list) => ({
  strongMatches: list.filter((m) => m.score >= STRONG).length,
  topScore: list[0]?.score ?? null,
});

const byStrength = (a, b) => b.strongMatches - a.strongMatches || (b.topScore ?? 0) - (a.topScore ?? 0);

const statsOf = (s) => ({
  properties: s.properties.size,
  matchableLeads: s.leads.size,
  totalLeads: s.totalLeads,
  sellers: s.sellers.size,
  builtAt: s.builtAt,
});

// ─── Queries ───────────────────────────────────────────────────────────────

async function listProperties({ search = "", from, to, refresh = false } = {}) {
  const s = await getSnapshot({ refresh });
  const inRange = signupFilter({ from, to });
  const q = search.trim().toLowerCase();
  const rows = [...s.properties.values()]
    .filter((p) => !q || `${p.name} ${p.street} ${p.city} ${p.state} ${p.zipCode}`.toLowerCase().includes(q))
    .map((p) => ({ ...publicProperty(p, s), ...summarize(buyersFor(s, p.id, { inRange })) }))
    .sort(byStrength);

  return { properties: rows, stats: statsOf(s) };
}

async function listLeads({ search = "", source = "", from, to, page = 1, limit = 50 } = {}) {
  const s = await getSnapshot();
  const inRange = signupFilter({ from, to });
  const q = search.trim().toLowerCase();
  const rows = [...s.leads.values()]
    .filter((l) => (!source || l.leadType === source) && inRange(l))
    .filter((l) => !q || `${l.name} ${l.email} ${l.phone} ${l.locationText}`.toLowerCase().includes(q))
    .map((l) => ({ ...publicLead(l), ...summarize(s.byLead.get(l.key)) }))
    .sort(byStrength);

  const start = (page - 1) * limit;
  return {
    leads: rows.slice(start, start + limit),
    pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) },
  };
}

async function listSellers({ search = "", from, to } = {}) {
  const s = await getSnapshot();
  const inRange = signupFilter({ from, to });
  const q = search.trim().toLowerCase();
  const rows = [...s.sellers.values()]
    .filter((sel) => !q || `${sel.name} ${sel.email}`.toLowerCase().includes(q))
    .map((sel) => {
      // A buyer who fits two of this seller's properties counts once.
      const best = new Map();
      for (const pid of sel.propertyIds) {
        for (const m of buyersFor(s, pid, { inRange })) {
          const k = personKey(s.leads.get(m.leadKey));
          if (!best.has(k) || best.get(k).score < m.score) best.set(k, m);
        }
      }
      const all = [...best.values()].sort((a, b) => b.score - a.score);
      return {
        id: sel.id,
        name: sel.name,
        email: sel.email,
        propertyCount: sel.propertyIds.length,
        ...summarize(all),
      };
    })
    .sort(byStrength);

  const unassigned = [...s.properties.values()].filter((p) => !p.sellerIds.length).length;
  return { sellers: rows, unassignedProperties: unassigned };
}

async function matchesForProperty(propertyId, { minScore = 50, source = "", from, to, limit = 50 } = {}) {
  const s = await getSnapshot();
  const prop = s.properties.get(String(propertyId));
  if (!prop) return null;

  const list = buyersFor(s, prop.id, { inRange: signupFilter({ from, to }), source, minScore });
  return {
    property: publicProperty(prop, s),
    total: list.length,
    matches: list.slice(0, limit).map((m) => ({ lead: publicLead(s.leads.get(m.leadKey)), ...matchFields(m, s) })),
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
    matches: list.slice(0, limit).map((m) => ({
      property: publicProperty(s.properties.get(m.propertyId), s),
      ...matchFields(m, s),
    })),
  };
}

async function matchesForSeller(sellerId, { minScore = 60, source = "", from, to, perProperty = 5 } = {}) {
  const s = await getSnapshot();
  const seller = s.sellers.get(String(sellerId));
  if (!seller) return null;
  const inRange = signupFilter({ from, to });

  const lists = seller.propertyIds.map((pid) => [pid, buyersFor(s, pid, { inRange, source, minScore })]);
  const properties = lists
    .map(([pid, list]) => ({
      property: publicProperty(s.properties.get(pid), s),
      total: list.length,
      matches: list.slice(0, perProperty).map((m) => ({ lead: publicLead(s.leads.get(m.leadKey)), ...matchFields(m, s) })),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    seller: { id: seller.id, name: seller.name, email: seller.email, propertyCount: seller.propertyIds.length },
    // A buyer who fits several of this seller's properties is counted once.
    uniqueBuyers: countPeople(lists.map(([, list]) => list), s.leads),
    properties,
  };
}

/**
 * Score every buyer against properties from an uploaded sheet (not saved —
 * nothing is written to the database). Same scorer, filters and de-duplication
 * as listed properties; sheet rows just carry less data, so fewer factors.
 */
async function matchesForSheet(sheetProperties, { minScore = 60, source = "", from, to, perProperty = 50 } = {}) {
  const s = await getSnapshot();
  const inRange = signupFilter({ from, to });
  const now = Date.now();
  const leads = [...s.leads.values()].filter((l) => inRange(l) && (!source || l.leadType === source));

  const lists = sheetProperties.map((prop) => {
    const scored = [];
    for (const lead of leads) {
      const m = scorePair(lead, prop, now);
      if (m && m.score >= minScore) scored.push({ leadKey: lead.key, propertyId: prop.id, ...m });
    }
    scored.sort((a, b) => b.rank - a.rank);
    return [prop, dedupeByPerson(scored, s.leads)];
  });

  return {
    uniqueBuyers: countPeople(lists.map(([, list]) => list), s.leads),
    properties: lists.map(([p, list]) => ({
      property: {
        id: p.id,
        row: p.row,
        street: p.street,
        city: p.city,
        state: p.state,
        zipCode: p.zipCode,
        price: p.price,
        priceSource: p.priceSource,
        value: p.value,
        beds: p.beds,
        baths: p.baths,
        propertyType: p.propertyType,
        status: p.status,
        disposition: p.disposition,
      },
      total: list.length,
      topScore: list[0]?.score ?? null,
      matches: list.slice(0, perProperty).map((m) => ({ lead: publicLead(s.leads.get(m.leadKey)), ...matchFields(m, s) })),
    })),
  };
}

/**
 * Live call / email / auction history for one buyer, plus whether the daily
 * call sweep is stopped (read fresh — the admin may have just toggled it).
 */
async function leadActivity(leadType, leadId) {
  const s = await getSnapshot();
  const lead = s.leads.get(`${leadType}:${leadId}`);
  const Model = MODEL_BY_TYPE[leadType];
  if (!lead || !Model) return null;

  // Only collections with a daily retry sweep have the stop/resume switch.
  const canStopCalling = !!Model.schema.path("callingStopped");
  const [activity, doc] = await Promise.all([
    getLeadActivity(lead),
    canStopCalling ? Model.findById(leadId).select("callingStopped").lean() : null,
  ]);

  return {
    ...activity,
    canStopCalling,
    callingStopped: !!doc?.callingStopped,
  };
}

/**
 * Everything the calling feature needs about one buyer + one property: the
 * buyer profile (answers, contact) and why they match. Match is null when the
 * property isn't open any more or the pair was ruled out.
 */
async function getMatchContext(leadType, leadId, propertyId) {
  const s = await getSnapshot();
  const lead = s.leads.get(`${leadType}:${leadId}`);
  if (!lead) return null;
  const prop = propertyId ? s.properties.get(String(propertyId)) : null;

  let match = null;
  if (prop) {
    match = s.byLead.get(lead.key).find((m) => m.propertyId === prop.id) || scorePair(lead, prop);
  }
  return {
    lead,
    wants: publicLead(lead).wants,
    property: prop ? publicProperty(prop, s) : null,
    match: match ? { score: match.score, reasons: match.reasons, concerns: match.concerns } : null,
  };
}

const SOURCE_OPTIONS = SOURCES.map(({ leadType, label }) => ({ value: leadType, label }));

module.exports = {
  listProperties,
  listLeads,
  listSellers,
  matchesForProperty,
  matchesForLead,
  matchesForSeller,
  matchesForSheet,
  leadActivity,
  getMatchContext,
  SOURCE_OPTIONS,
};
