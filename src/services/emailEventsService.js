// services/emailEventsService.js
//
// Two responsibilities:
//   1. ingestBrevoEvents  — WRITE side: parse Brevo webhook payloads → save events.
//   2. getEmailEventsForEmails — READ side: fetch a batch of leads' email events,
//      grouped by recipient, for the admin leads tabs. This is the email analogue
//      of vapiCallsService.getCallsForPhones (calls-by-phone → events-by-email).
//
// Brevo has two payload shapes and ingest handles both, because your nurture
// emails go out from list automations (which fire TRANSACTIONAL events) but you
// may also run marketing CAMPAIGNS later (which fire MARKETING events):
//
//   transactional: { event, email, "message-id", subject, tags:[...], ts_epoch, ts_event, date, link }
//   marketing:     { event, email, camp_id, "campaign name", tag, date_event, URL }

const EmailEvent = require("../model/emailEventModel");

/* ─────────────────────────── WRITE SIDE ─────────────────────────── */

/**
 * Resolve the event's true UTC timestamp. Brevo's epoch fields are UTC; its
 * `date` string is CET/CEST, so we only fall back to it when no epoch is sent.
 *   ts_epoch → ms  |  ts_event / ts → seconds  |  date_event/date → string
 */
const toEventDate = (e) => {
  if (e.ts_epoch) return new Date(Number(e.ts_epoch));
  if (e.ts_event) return new Date(Number(e.ts_event) * 1000);
  if (e.ts) return new Date(Number(e.ts) * 1000);
  if (e.date_event) return new Date(e.date_event); // marketing
  if (e.date) return new Date(e.date);             // CET — last resort
  return new Date();
};

// Brevo sends `tags` (array, transactional) or `tag` (string, marketing).
const firstTag = (e) => {
  if (Array.isArray(e.tags) && e.tags.length) return String(e.tags[0]);
  if (typeof e.tag === "string") return e.tag;
  if (Array.isArray(e.tag) && e.tag.length) return String(e.tag[0]);
  return "";
};

/**
 * One raw Brevo event → one emailEvent doc, or null if unusable (no recipient
 * or no event type — nothing worth storing).
 */
const mapEvent = (e) => {
  const email = String(e.email || "").trim().toLowerCase();
  const event = String(e.event || "").trim().toLowerCase();
  if (!email || !event) return null;

  return {
    email,                                   // join key to every lead model
    event,                                   // delivered | opened | click | ...
    subject: e.subject || e["campaign name"] || e.campaign_name || "",
    messageId: e["message-id"] || e.messageId || "",
    tag: firstTag(e),
    link: e.link || e.URL || e.url || "",    // click target (both shapes)
    date: toEventDate(e),
    raw: e,
  };
};

/**
 * Persist one webhook delivery. Brevo may POST a single event object OR a batch
 * array, so we accept both. Returns { saved, skipped } counts.
 *
 * Throws only on a real DB failure — the webhook controller lets that surface as
 * a 500 so Brevo retries the delivery. A payload with no usable events returns
 * { saved: 0 } WITHOUT throwing, so Brevo gets a 200 and doesn't retry it.
 */
const ingestBrevoEvents = async (body) => {
  const items = Array.isArray(body) ? body : [body];
  const docs = items.map(mapEvent).filter(Boolean);

  if (!docs.length) return { saved: 0, skipped: items.length };

  const inserted = await EmailEvent.insertMany(docs, { ordered: false });
  return { saved: inserted.length, skipped: items.length - inserted.length };
};

/* ─────────────────────────── READ SIDE ─────────────────────────── */

/**
 * Given a list of lead email addresses, return their email events grouped by
 * recipient: { "lead@x.com": [ {event, subject, link, tag, date}, ... newest→oldest ] }.
 *
 * Mirrors getCallsForPhones: best-effort — on any DB error it returns {} so the
 * admin leads list still renders (each lead just gets an empty `emails` array),
 * exactly like calls fall back to empty when VAPI is unreachable.
 */
const getEmailEventsForEmails = async (emails = []) => {
  const unique = [
    ...new Set(
      (emails || [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (!unique.length) return {};

  let events = [];
  try {
    events = await EmailEvent.find({ email: { $in: unique } })
      .select("email event subject link tag date")
      .sort({ date: -1 })          // newest first (preserved per-group below)
      .lean();
  } catch (err) {
    console.error("[email-events] lookup failed:", err.message);
    return {}; // best-effort — leads still render with empty emails
  }

  const byEmail = {};
  for (const ev of events) {
    (byEmail[ev.email] = byEmail[ev.email] || []).push(ev);
  }
  return byEmail;
};

module.exports = { ingestBrevoEvents, getEmailEventsForEmails };
