// services/leads/propertyRequest.js
//
// "Request a property" — the website finder's /request flow, for buyers who
// don't see the deal they want. The request rides on a /new-deals sign-up as
// body.request; the team reads the demand to decide which properties to bring
// next (GET /api/v1/new-deals/requests).
//
// This file: validate the request, put it into words (admin report, Slack,
// the request email's PROPERTY_WANTED), map it onto the buy box, and decide
// whether a property fits it. Pure functions, no DB.

const { str, stateName, priceRangeText } = require("./buyBox");

// Must match REQ_TYPE_OPTIONS / REQ_CONDITION_OPTIONS in the website's FinderPage.tsx.
const TYPES = ["single_family", "multi_family", "condo"]; // none picked = any type
const CONDITIONS = ["move_in", "light_work", "full_renovation", "any"];
const PURPOSES = ["live_in", "rental", "fix_flip"];
const TIMELINES = ["30d", "90d", "180d"];
const BEDS_MIN = 1;
const BEDS_MAX = 6;
const WHERE_MAX = 120;
const NOTES_MAX = 600;

const TYPE_WORDS = { single_family: "single-family home", multi_family: "multi-family property", condo: "condo or townhouse" };
const TYPE_LABELS = { single_family: "Single-family", multi_family: "Multi-family", condo: "Condo / townhouse" };
const CONDITION_WORDS = { move_in: "move-in ready", light_work: "needs light work", full_renovation: "full renovation is fine" };
const TIMELINE_LABELS = { "30d": "Within 30 days", "90d": "In 1 to 3 months", "180d": "In 3 to 6 months" };
const PURPOSE_LABELS = { live_in: "Live in it", rental: "Rent it out", fix_flip: "Fix and sell" };

// productModel.propertyType → request type. Land is never a request type, so it never fits.
const TYPE_OF_PROPERTY = {
  "Single Family": "single_family",
  "Condo, Townhouse, other single unit": "condo",
  "Multi-family": "multi_family",
  Multiplex: "multi_family", // older listings
};

// Request → the /new-deals buy box values (newDealsLeadController PROPERTY_TYPES, buyBox CONDITIONS).
const BUY_BOX_TYPES = { single_family: ["sfr"], multi_family: ["mf_2_4", "mf_5_plus"], condo: ["condo"] };
const BUY_BOX_CONDITION = { move_in: "turnkey", light_work: "light_rehab", full_renovation: "heavy_rehab", any: "any" };

/**
 * body.request → a clean request, or null when there is none. Unknown values
 * are dropped and the free text is cut to length.
 */
const requestFrom = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const beds = Number(raw.bedsMin);
  return {
    types: Array.isArray(raw.types) ? TYPES.filter((t) => raw.types.map(String).includes(t)) : [],
    bedsMin: Number.isInteger(beds) && beds >= BEDS_MIN && beds <= BEDS_MAX ? beds : null,
    condition: CONDITIONS.includes(raw.condition) ? raw.condition : "",
    where: str(raw.where, WHERE_MAX).replace(/\s+/g, " "),
    notes: str(raw.notes, NOTES_MAX),
    purpose: PURPOSES.includes(raw.purpose) ? raw.purpose : "",
    timeline: TIMELINES.includes(raw.timeline) ? raw.timeline : "",
  };
};

// Same request twice (a double tap, a resend): keep the first one's date and email.
const sameRequest = (a, b) =>
  !!a && !!b && ["types", "bedsMin", "condition", "where", "notes", "purpose", "timeline"].every(
    (k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null)
  );

/** "3+ bed single-family home in Baltimore, needs light work" */
const requestWords = (request, state = "") => {
  if (!request) return "";
  const types = request.types || [];
  const what = types.length ? types.map((t) => TYPE_WORDS[t]).join(" or ") : "property";
  const where = request.where || (state ? stateName(state) : "");
  const text = [
    request.bedsMin ? `${request.bedsMin}+ bed ` : types.length ? "" : "any ",
    what,
    where ? ` in ${where}` : "",
    CONDITION_WORDS[request.condition] ? `, ${CONDITION_WORDS[request.condition]}` : "",
  ].join("");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Does this property fit the request? Only the requested type (any of the
 * three when none was picked) with at least bedsMin bedrooms. No request = fits.
 * @param {{ propertyType?: string, beds?: number }} prop
 */
const fitsRequest = (request, prop) => {
  if (!request) return true;
  const type = TYPE_OF_PROPERTY[prop.propertyType];
  if (!type) return false;
  if (request.types && request.types.length && !request.types.includes(type)) return false;
  if (request.bedsMin && !(Number(prop.beds) >= request.bedsMin)) return false;
  return true;
};

/** Fill the buy box's type and condition from the request, where the form left them empty. */
const applyRequestToBuyBox = (buyBox, request) => {
  if (!request) return buyBox;
  if (!buyBox.property_type.length) buyBox.property_type = request.types.flatMap((t) => BUY_BOX_TYPES[t]);
  if (!buyBox.condition && request.condition) buyBox.condition = BUY_BOX_CONDITION[request.condition];
  return buyBox;
};

// ── The demand report ───────────────────────────────────────────────────────

const within90 = (request) => request.timeline === "30d" || request.timeline === "90d";
const isCash = (box = {}) => box.financing === "cash";

/** One row of the report, from a /new-deals lead that has a request. */
const reportRow = (lead) => {
  const r = lead.request || {};
  const box = lead.buyBox || {};
  const state = (box.states || [])[0] || "";
  return {
    id: String(lead._id),
    requestedAt: r.requestedAt || lead.updatedAt || lead.createdAt || null,
    name: lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(" "),
    email: lead.email || "",
    phone: lead.phone || "",
    state,
    wanted: requestWords(r, state),
    types: r.types || [],
    bedsMin: r.bedsMin ?? null,
    condition: r.condition || "",
    where: r.where || "",
    budget: priceRangeText(box),
    pay: box.financing === "cash" ? "Cash" : box.financing ? "Financing" : "",
    timing: TIMELINE_LABELS[r.timeline] || "",
    purpose: PURPOSE_LABELS[r.purpose] || "",
    notes: r.notes || "",
    cash: isCash(box),
    within90: within90(r),
    source: (lead.firstTouch && lead.firstTouch.utm_source) || "",
  };
};

// "Baltimore, 21224" and "baltimore" count as the same area.
const areaKey = (row) => (row.where.split(",")[0] || "").trim().toLowerCase();

/**
 * Counts by state, area, type, bedrooms and budget. Each bucket says how many
 * of those people pay cash and how many want to buy within 90 days.
 */
const demandCounts = (rows) => {
  const groups = { state: new Map(), area: new Map(), type: new Map(), bedrooms: new Map(), budget: new Map() };
  const add = (group, key, label, row) => {
    const m = groups[group];
    const b = m.get(key) || { key, label, count: 0, cash: 0, within90: 0 };
    b.count += 1;
    if (row.cash) b.cash += 1;
    if (row.within90) b.within90 += 1;
    m.set(key, b);
  };
  rows.forEach((row) => {
    add("state", row.state || "none", row.state ? stateName(row.state) : "No state", row);
    const area = areaKey(row);
    if (area) add("area", `${row.state}:${area}`, `${row.where.split(",")[0].trim()}${row.state ? `, ${row.state}` : ""}`, row);
    (row.types.length ? row.types : ["any"]).forEach((t) => add("type", t, TYPE_LABELS[t] || "Any type", row));
    add("bedrooms", String(row.bedsMin || "any"), row.bedsMin ? `${row.bedsMin}+ beds` : "Any", row);
    add("budget", row.budget || "none", row.budget || "Not given", row);
  });
  const sorted = (m) => [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return Object.fromEntries(Object.entries(groups).map(([k, m]) => [k, sorted(m)]));
};

const REPORT_COLUMNS = [
  ["requestedAt", "Requested"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["state", "State"],
  ["wanted", "Request"],
  ["budget", "Budget"],
  ["pay", "Pay"],
  ["timing", "Timing"],
  ["purpose", "Plan"],
  ["notes", "Notes"],
  ["source", "Source"],
];

const reportCsv = (rows) => {
  const cell = (v) => `"${String(v instanceof Date ? v.toISOString() : v ?? "").replace(/"/g, '""')}"`;
  return [
    REPORT_COLUMNS.map(([, label]) => cell(label)).join(","),
    ...rows.map((row) => REPORT_COLUMNS.map(([k]) => cell(row[k])).join(",")),
  ].join("\n");
};

module.exports = {
  TYPES,
  CONDITIONS,
  WHERE_MAX,
  NOTES_MAX,
  requestFrom,
  sameRequest,
  requestWords,
  fitsRequest,
  applyRequestToBuyBox,
  reportRow,
  demandCounts,
  reportCsv,
};
