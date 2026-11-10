// services/propertyFunnel/pfTouches.js
//
// Property Funnel: our own follow-up records → the page's Touch rows (contract.ts). Pure functions.
//   VText: our Vtext messages (one touch per text we sent, with its best result; a reply or an opt-out
//          upgrades the last text sent before it)
//   Call:  Maya's call log (hand calls are not logged anywhere, so only Maya counts)
//   Email: Brevo's webhook events (one touch per email, with its best result)
//
// A touch is matched to a lead by phone (10 digits) or lowercased email, and only to leads created at or
// before it: a text about one property doesn't count as contacting a lead that came in later.

const { deriveOutcome } = require("../calling/callOutcome");
const { phoneKey, emailKey } = require("./pfCore");

/** Later outcomes beat earlier ones for the same message (Prajwal's RANK). */
const RANK = { Sent: 1, Delivered: 2, Opened: 3, Voicemail: 2, "No answer": 1, Clicked: 4, Replied: 5, Connected: 5, Failed: 6, Bounced: 6, "Opted out": 7 };
const better = (a, b) => ((RANK[b] || 0) > (RANK[a] || 0) ? b : a);

/** leads → (key → leads sorted by createdAt), for phone and email matching. */
function leadIndex(leads) {
  const byPhone = new Map(), byEmail = new Map();
  for (const l of leads) {
    const p = phoneKey(l.phone), e = emailKey(l.email);
    if (p.length === 10) byPhone.set(p, [...(byPhone.get(p) || []), l]);
    if (e) byEmail.set(e, [...(byEmail.get(e) || []), l]);
  }
  return { byPhone, byEmail };
}
/** Leads with this key that existed when the touch happened. */
const leadsAt = (list, at) => (list || []).filter((l) => new Date(l.createdAt).getTime() <= new Date(at).getTime());

const fanOut = (leads, t) => leads.map((l) => ({ ...t, leadId: l.id }));

// ---------------------------------------------------------------- VText

const SENT = new Set(["sent", "accepted"]);
const DELIVERED = new Set(["delivered", "read"]);
const FAILED = new Set(["failed", "cancelled", "blocked"]);
const AUTOMATED = new Set(["automation", "system", "bulk", "api"]);

function vtextOutcome(status) {
  if (DELIVERED.has(status)) return "Delivered";
  if (SENT.has(status)) return "Sent";
  if (FAILED.has(status)) return "Failed";
  return null; // not sent yet (queued, waiting, sending, pending-approval) or unknown
}

/**
 * When a text happened: for our texts, the time it was sent (a text can wait in the queue for hours,
 * e.g. sending hours, daily limits or a re-send batch); for replies, and texts with no send time, when it was saved.
 */
const textTime = (m) => new Date(m.direction === "out" && m.sentAt ? m.sentAt : m.createdAt);

function vtextTouches(messages, contacts, idx) {
  const phoneOf = new Map(contacts.map((c) => [String(c._id), phoneKey(c.phoneE164)]));
  const byContact = new Map();
  for (const m of [...messages].sort((a, b) => textTime(a) - textTime(b))) {
    const k = String(m.contactId);
    byContact.set(k, [...(byContact.get(k) || []), m]);
  }
  const out = [];
  for (const c of contacts) {
    const msgs = byContact.get(String(c._id)) || [];
    const sent = []; // our texts to this person, oldest first: { at, outcome, by, template }
    for (const m of msgs) {
      if (m.direction === "out") {
        const outcome = vtextOutcome(m.status);
        if (!outcome) continue;
        const o = m.origin || {};
        const by = o.sentBy && o.sentBy.adminName ? String(o.sentBy.adminName).split(" ")[0] : AUTOMATED.has(o.kind) ? "Automation" : null;
        sent.push({ at: textTime(m), outcome, by, template: o.templateKey || null });
      } else if (m.direction === "in") {
        // A reply upgrades the last text we sent before it; a person who texts first is a touch of its own.
        const at = textTime(m);
        const last = [...sent].reverse().find((s) => s.at <= at);
        if (last) last.outcome = better(last.outcome, "Replied");
        else sent.push({ at, outcome: "Replied", by: null, template: null });
      }
    }
    const optOutAt = c.optOut && c.optOut.isOptedOut && c.optOut.at ? new Date(c.optOut.at) : null;
    if (optOutAt) {
      const last = [...sent].reverse().find((s) => s.at <= optOutAt);
      if (last) last.outcome = "Opted out";
    }
    const leads = idx.byPhone.get(phoneOf.get(String(c._id)));
    for (const s of sent) {
      out.push(...fanOut(leadsAt(leads, s.at), { at: s.at.toISOString(), kind: "VText", outcome: s.outcome, durationSec: null, by: s.by, template: s.template }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- Calls (Maya)

/** Maya's own outcome words → the page's. Missed and errors = no answer; any real conversation = connected. */
function callOutcome(call) {
  const secs = Number(call.durationSeconds || 0);
  const o = deriveOutcome(call, secs);
  if (o === "voicemail") return "Voicemail";
  if (o === "missed") return "No answer";
  return "Connected"; // positive, negative, callback: a person talked to Maya
}

function callTouches(calls, idx) {
  const out = [];
  for (const c of calls) {
    const at = new Date(c.startedAt || c.createdAt);
    const outcome = callOutcome(c);
    out.push(...fanOut(leadsAt(idx.byPhone.get(phoneKey(c.phone)), at), {
      at: at.toISOString(), kind: "Call", outcome,
      durationSec: outcome === "Connected" ? Math.round(Number(c.durationSeconds || 0)) : null, by: "Maya", template: null,
    }));
  }
  return out;
}

// ---------------------------------------------------------------- Email (Brevo events)

const EMAIL_EVENT = {
  request: "Sent", sent: "Sent", delivered: "Sent", deferred: "Sent",
  opened: "Opened", unique_opened: "Opened", proxy_open: "Opened", unique_proxy_open: "Opened",
  click: "Clicked", reply: "Replied", inbound: "Replied",
  hard_bounce: "Bounced", soft_bounce: "Bounced", invalid_email: "Bounced", blocked: "Bounced", error: "Bounced",
};

function emailTouches(events, idx) {
  // One touch per email (Brevo message id), keeping its best result and its earliest time (the send).
  const byMsg = new Map();
  for (const e of events) {
    const outcome = EMAIL_EVENT[String(e.event || "").toLowerCase()];
    if (!outcome) continue; // unsubscribe, spam and unknown events are not a touch
    const key = `${emailKey(e.email)}|${e.messageId || e.subject || ""}`;
    const at = new Date(e.date);
    const g = byMsg.get(key);
    if (!g) byMsg.set(key, { email: emailKey(e.email), at, outcome, template: e.subject || null });
    else { g.outcome = better(g.outcome, outcome); if (at < g.at) g.at = at; if (!g.template && e.subject) g.template = e.subject; }
  }
  const out = [];
  for (const g of byMsg.values()) {
    out.push(...fanOut(leadsAt(idx.byEmail.get(g.email), g.at), { at: g.at.toISOString(), kind: "Email", outcome: g.outcome, durationSec: null, by: "Automation", template: g.template }));
  }
  return out;
}

/** Every touch to these leads, oldest first. */
function buildTouches(leads, { messages = [], contacts = [], calls = [], emailEvents = [] }) {
  const idx = leadIndex(leads);
  return [...vtextTouches(messages, contacts, idx), ...callTouches(calls, idx), ...emailTouches(emailEvents, idx)]
    .sort((a, b) => a.at.localeCompare(b.at));
}

module.exports = { buildTouches, vtextOutcome, callOutcome, RANK };
