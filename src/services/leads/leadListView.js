// services/leads/leadListView.js
//
// Two optional query params shared by the admin lead-list endpoints:
//
//   ?view=summary  Light rows for the Leads tab table: only the fields a row
//                  shows (name, contact, tags, date) plus the latest call's
//                  outcome + score and the call count, and a light text state
//                  (sent / failed / replied) and email state (emailStats).
//                  Full email, message and note lookups are skipped and call
//                  transcripts never leave Mongo.
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
const { getVtextTextSummaryForPhones } = require("../vtext/vtextLeadMessagesService");
const { getEmailSummaryForEmails } = require("../integrations/emailEventsService");
const { fundingOf } = require("./leadFunding");

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
  "formId", "hot", "hotReasons", "leadStatus", "phoneInvalid", "smsConsent",
];

// Read on the server (funding, the All Leads filter); they don't go out on a row.
const SERVER_ONLY_FIELDS = ["needsFinancing", "buyBox.financing", "answers", "isTest", "propertySlug"];

// Call state, so a row with no call can say why (no consent, stopped, QA test…).
// Funnels without a field just leave it out.
const CALL_STATE_FIELDS = ["consent", "callingStopped", "callAttempts", "callStatus", "nextCallAt", "isQaTest"];

/** Mongo projection for the list query: row fields in summary mode, else everything. */
const listSelect = (view) => (view.summary ? [...ROW_FIELDS, ...CALL_STATE_FIELDS, ...SERVER_ONLY_FIELDS].join(" ") : undefined);

/**
 * Calls for a page of leads. Resolves to `callsFor(phone)` →
 * { calls, callCount, pickedUp }. Summary mode reads only the newest call per
 * phone (plus counts); otherwise every call with its transcript.
 * Summary mode also adds `texts` ({ sent, failed, replied, imessage, sms? }, see vtextLeadMessagesService) for
 * the text lines and filters; full leads carry
 * `messages` instead, which the filter reads.
 */
async function callsForList(view, phones) {
  if (view.summary) {
    const [byPhone, textsByPhone] = await Promise.all([getCallSummaryForPhones(phones), getVtextTextSummaryForPhones(phones)]);
    return (phone) => {
      const key = normalisePhone(phone);
      const s = byPhone[key];
      const texts = textsByPhone[key] || { sent: 0, failed: 0, replied: false };
      return s
        ? { calls: [slimCall(s.latest)], callCount: s.count, pickedUp: s.pickedUp, texts }
        : { calls: [], callCount: 0, pickedUp: false, texts };
    };
  }
  const byPhone = await getCallsForPhones(phones);
  return (phone) => {
    const calls = byPhone[normalisePhone(phone)] || [];
    return { calls, callCount: calls.length, pickedUp: calls.some((c) => PICKUP_OUTCOMES.has(c.outcome)) };
  };
}

const slimCall = (c) => ({ id: c.id, outcome: c.outcome, score: c.score, startedAt: c.startedAt });

const SUMMARY_KEYS = [
  "_id", ...ROW_FIELDS, ...CALL_STATE_FIELDS, "propertyName", "leadType", "leadTypeLabel", "calls", "callCount", "pickedUp", "texts",
  "funding", "emailStats", "status", "emailBounced",
];

/**
 * Every lead gets `funding` (cash / financing / not sure). Summary rows keep
 * only what the table renders, plus `emailStats`; full leads carry `emails`.
 */
async function shapeLeads(view, leads) {
  const withFunding = leads.map((lead) => ({ ...lead, funding: fundingOf(lead) }));
  if (!view.summary) return withFunding;
  const statsByEmail = await getEmailSummaryForEmails(leads.map((l) => l.email).filter(Boolean));
  return withFunding.map((lead) => {
    const row = {};
    for (const k of SUMMARY_KEYS) if (lead[k] !== undefined) row[k] = lead[k];
    row.emailStats = statsByEmail[String(lead.email || "").toLowerCase()];
    return row;
  });
}

module.exports = { listView, scopeQuery, unlessSummary, listSelect, callsForList, shapeLeads };
