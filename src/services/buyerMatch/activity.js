// services/buyerMatch/activity.js
//
// What we already know about each buyer outside their signup form:
//   • calls      — CallLog rows for their phone (Maya / Voice Agent calls)
//   • emails     — Brevo email events for their address
//   • auctions   — auction registrations (auctionRegistration) matched by
//                  email or phone, since a lead and a site user are different
//                  records
//
// attachActivity() stamps a compact summary onto every lead profile for the
// snapshot (scoring + list badges). getLeadActivity() returns the full, live
// history for one buyer when an admin opens their row.

const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const Product = require("../../model/property/productModel");
const { getCallsForPhones, normalisePhone } = require("../calling/vapiCallsService");
const { getEmailEventsForEmails } = require("../integrations/emailEventsService");

// Same definition the Interested Leads tab uses: a human actually answered.
const PICKUP_OUTCOMES = new Set(["positive", "negative", "callback"]);
const OPEN_EVENTS = new Set(["opened", "unique_opened", "click"]);

const emailKey = (e) => String(e || "").trim().toLowerCase();

/** Registrations grouped by email and by phone, for lead lookups. */
async function loadRegistrationIndex() {
  const regs = await AuctionRegistration.find()
    .select("auctionId email mobilePhone status submittedAt")
    .sort({ submittedAt: -1 })
    .lean();

  const byEmail = new Map();
  const byPhone = new Map();
  for (const r of regs) {
    const row = { propertyId: String(r.auctionId), status: r.status, at: r.submittedAt };
    const e = emailKey(r.email);
    const p = normalisePhone(r.mobilePhone);
    if (e) (byEmail.get(e) || byEmail.set(e, []).get(e)).push(row);
    if (p) (byPhone.get(p) || byPhone.set(p, []).get(p)).push(row);
  }
  return { byEmail, byPhone };
}

function registrationsFor(lead, index) {
  const seen = new Set();
  return [
    ...(index.byEmail.get(emailKey(lead.email)) || []),
    ...(index.byPhone.get(normalisePhone(lead.phone)) || []),
  ].filter((r) => {
    if (seen.has(r.propertyId)) return false;
    seen.add(r.propertyId);
    return true;
  });
}

/**
 * Add { calls, emails, auctionRegistrations } summaries to every lead (in place).
 * Each lookup is best-effort: if one store is down the page still works, just
 * without that signal.
 */
async function attachActivity(leads) {
  const [callsByPhone, eventsByEmail, regIndex] = await Promise.all([
    getCallsForPhones(leads.map((l) => l.phone).filter(Boolean)),
    getEmailEventsForEmails(leads.map((l) => l.email).filter(Boolean)),
    loadRegistrationIndex().catch((err) => {
      console.error("[buyer-match] registration lookup failed:", err.message);
      return { byEmail: new Map(), byPhone: new Map() };
    }),
  ]);

  for (const lead of leads) {
    const calls = callsByPhone[normalisePhone(lead.phone)] || [];
    const events = eventsByEmail[emailKey(lead.email)] || [];

    lead.calls = {
      count: calls.length,
      pickedUp: calls.some((c) => PICKUP_OUTCOMES.has(c.outcome)),
      lastOutcome: calls[0]?.outcome || null,
      lastAt: calls[0]?.startedAt || null,
    };
    lead.emails = {
      count: events.length,
      opened: events.some((e) => OPEN_EVENTS.has(e.event)),
      lastEvent: events[0]?.event || null,
      lastAt: events[0]?.date || null,
    };
    lead.auctionRegistrations = registrationsFor(lead, regIndex);
    // A picked-up call counts as "reached" even if the lead's own callStatus
    // was never updated by its scheduler.
    if (lead.calls.pickedUp) lead.engagement.connected = true;
  }
}

/** Full live history for one buyer (opened row in the admin page). */
async function getLeadActivity(lead) {
  const [callsByPhone, eventsByEmail, regIndex] = await Promise.all([
    getCallsForPhones([lead.phone]),
    getEmailEventsForEmails([lead.email]),
    loadRegistrationIndex(),
  ]);

  const regs = registrationsFor(lead, regIndex);
  const props = await Product.find({ _id: { $in: regs.map((r) => r.propertyId) } })
    .select("street city state slug")
    .lean();
  const propById = new Map(props.map((p) => [String(p._id), p]));

  return {
    calls: (callsByPhone[normalisePhone(lead.phone)] || []).map((c) => ({
      id: c.id,
      outcome: c.outcome,
      startedAt: c.startedAt,
      durationSecs: c.durationSecs,
      summary: c.summary,
    })),
    emails: (eventsByEmail[emailKey(lead.email)] || []).map((e) => ({
      event: e.event,
      subject: e.subject,
      date: e.date,
    })),
    auctionRegistrations: regs.map((r) => {
      const p = propById.get(r.propertyId);
      return {
        ...r,
        property: p ? `${p.street}, ${p.city}, ${p.state}` : "Property no longer listed",
        slug: p?.slug || null,
      };
    }),
  };
}

module.exports = { attachActivity, getLeadActivity };
