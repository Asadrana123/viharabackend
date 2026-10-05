// services/leads/leadListView.js
//
// Two optional query params shared by the admin lead-list endpoints:
//
//   ?view=summary  Light rows for the Leads tab table: each call is cut down to
//                  outcome + score + time (no transcript / summary), and the
//                  email, text and note lookups are skipped entirely.
//   ?id=<leadId>   Just that one lead, fully loaded (what the detail modal shows).
//                  Ignores the list's test-name filter so any lead can be opened.
//
// Without either param the endpoints behave exactly as before.

const mongoose = require("mongoose");

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

const slimCall = (c) => ({ id: c.id, outcome: c.outcome, score: c.score, startedAt: c.startedAt });

/** Summary rows: slim calls, drop the heavy per-lead arrays. */
function shapeLeads(view, leads) {
  if (!view.summary) return leads;
  return leads.map(({ calls, emails, notes, messages, ...lead }) => ({
    ...lead,
    calls: Array.isArray(calls) ? calls.map(slimCall) : [],
  }));
}

module.exports = { listView, scopeQuery, unlessSummary, shapeLeads };
