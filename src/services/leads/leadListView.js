// services/leads/leadListView.js
//
// Two optional query params shared by the admin lead-list endpoints:
//
//   ?view=summary  Light rows for the Leads tab table: only the fields a row
//                  shows (name, contact, tags, date) plus the latest call's
//                  outcome + score and the call count. Email, text and note
//                  lookups are skipped and call transcripts never leave Mongo.
//   ?id=<leadId>   Just that one lead, fully loaded (what the detail modal shows).
//                  Ignores the list's test-name filter so any lead can be opened.
//
// Without either param the endpoints behave exactly as before.

const mongoose = require("mongoose");
const {
  getCallsForPhones,
  getCallSummaryForPhones,
  normalisePhone,
  PICKUP_OUTCOMES,
} = require("../calling/vapiCallsService");

function listView(req) {
  const raw = String(req.query.id || "");
  return {
    summary: req.query.view === "summary",
    id: raw && mongoose.Types.ObjectId.isValid(raw) ? raw : null,
    badId: !!raw && !mongoose.Types.ObjectId.isValid(raw),
  };
}

/** The list query, or just `{ _id }` when one lead was asked for. */
const scopeQuery = (view, query, extra = {}) => (view.id ? { _id: view.id, ...extra } : query);

/** Skip a lookup's input in summary mode (every lookup returns {} for []). */
const unlessSummary = (view, list) => (view.summary ? [] : list);

// Lead fields a table row reads (name, contact, tags, search, date filter),
// across every funnel. Anything else is only fetched when the lead is opened.
const ROW_FIELDS = [
  "fullName", "firstName", "lastName", "name", "email", "phone", "createdAt",
  "tier", "buyerType", "persona", "primaryMarket", "market", "markets", "formName",
];

/** Mongo projection for the list query: row fields in summary mode, else everything. */
const listSelect = (view) => (view.summary ? ROW_FIELDS.join(" ") : undefined);

/**
 * Calls for a page of leads. Resolves to `callsFor(phone)` →
 * { calls, callCount, pickedUp }. Summary mode reads only the newest call per
 * phone (plus counts); otherwise every call with its transcript.
 */
async function callsForList(view, phones) {
  if (view.summary) {
    const byPhone = await getCallSummaryForPhones(phones);
    return (phone) => {
      const s = byPhone[normalisePhone(phone)];
      return s
        ? { calls: [slimCall(s.latest)], callCount: s.count, pickedUp: s.pickedUp }
        : { calls: [], callCount: 0, pickedUp: false };
    };
  }
  const byPhone = await getCallsForPhones(phones);
  return (phone) => {
    const calls = byPhone[normalisePhone(phone)] || [];
    return { calls, callCount: calls.length, pickedUp: calls.some((c) => PICKUP_OUTCOMES.has(c.outcome)) };
  };
}

const slimCall = (c) => ({ id: c.id, outcome: c.outcome, score: c.score, startedAt: c.startedAt });

const SUMMARY_KEYS = ["_id", ...ROW_FIELDS, "propertyName", "leadType", "leadTypeLabel", "calls", "callCount", "pickedUp"];

/** Summary rows: keep only what the table renders. */
function shapeLeads(view, leads) {
  if (!view.summary) return leads;
  return leads.map((lead) => {
    const row = {};
    for (const k of SUMMARY_KEYS) if (lead[k] !== undefined) row[k] = lead[k];
    return row;
  });
}

module.exports = { listView, scopeQuery, unlessSummary, listSelect, callsForList, shapeLeads };
