// scripts/backfillBrevoEmails.js
//
// ONE-TIME (safe to re-run) backfill of historical Brevo email events into the
// emailEvent collection — for emails that were sent BEFORE the webhook existed.
//
// The webhook only captures events from the moment it was created. This script
// fills in the past by reading Brevo's transactional event history API
// (GET /v3/smtp/statistics/events) and upserting each event, so it never
// duplicates rows the webhook already stored (or a previous run of this script).
//
// Run it from the Render shell (env vars DB_URI + BREVO_API_KEY are already set):
//     node scripts/backfillBrevoEmails.js
// Go further back than the default 90 days:
//     BACKFILL_DAYS=365 node scripts/backfillBrevoEmails.js
//
// Notes:
//   • Brevo caps each API call to a 90-day window, so we loop in 90-day chunks.
//   • Event names from this API differ from the webhook's (e.g. "clicks" vs
//     "click"); we normalize them to the same canonical values the frontend
//     badges understand, so history and live events look identical.

try { require("dotenv").config(); } catch (_) { /* env already set on Render */ }

const mongoose = require("mongoose");
const axios = require("axios");
const EmailEvent = require("../model/emailEventModel");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const DB_URI = process.env.DB_URI;
const BREVO_BASE = "https://api.brevo.com/v3";

const BACKFILL_DAYS = Math.max(1, parseInt(process.env.BACKFILL_DAYS, 10) || 90);
const WINDOW_DAYS = 90;   // Brevo hard limit per call
const PAGE_LIMIT = 2500;  // Brevo max is 5000; 2500 is comfortable

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD

// Statistics-API event names → the canonical values the webhook stores and the
// frontend badge config understands. Unknown values pass through lowercased.
const NORMALIZE = {
  requests: "request",
  request: "request",
  delivered: "delivered",
  opened: "opened",
  uniqueopened: "unique_opened",
  clicks: "click",
  click: "click",
  hardbounces: "hard_bounce",
  hardbounce: "hard_bounce",
  softbounces: "soft_bounce",
  softbounce: "soft_bounce",
  bounces: "hard_bounce",
  spam: "spam",
  unsubscribed: "unsubscribe",
  unsubscribe: "unsubscribe",
  invalid: "invalid",
  deferred: "deferred",
  error: "error",
  blocked: "blocked",
  loadedbyproxy: "loaded_by_proxy",
};

const normEvent = (e) => {
  const key = String(e || "").toLowerCase().replace(/[_\s-]/g, "");
  return NORMALIZE[key] || String(e || "").toLowerCase();
};

// One raw Brevo statistics event → an emailEvent doc (same shape the webhook
// writes), or null if unusable.
const mapEvent = (e) => {
  const email = String(e.email || "").trim().toLowerCase();
  const event = normEvent(e.event);
  if (!email || !event) return null;

  return {
    email,
    event,
    subject: e.subject || "",
    messageId: e.messageId || e["message-id"] || "",
    tag: Array.isArray(e.tags) ? e.tags[0] || "" : e.tag || "",
    link: e.link || e.url || "",
    date: e.date ? new Date(e.date) : new Date(),
    raw: e,
  };
};

// Fetch one page of events for a date window.
const fetchPage = async (startDate, endDate, offset) => {
  const { data } = await axios.get(`${BREVO_BASE}/smtp/statistics/events`, {
    headers: { "api-key": BREVO_API_KEY, Accept: "application/json" },
    params: { startDate, endDate, limit: PAGE_LIMIT, offset, sort: "desc" },
  });
  return Array.isArray(data?.events) ? data.events : [];
};

// Idempotent upsert: only inserts events not already stored. A message can have
// many events, and an email can be opened many times, so the dedup key includes
// the timestamp — repeated opens are preserved, exact repeats are not.
const upsertEvents = async (docs) => {
  if (!docs.length) return 0;
  const ops = docs.map((d) => ({
    updateOne: {
      filter: d.messageId
        ? { messageId: d.messageId, event: d.event, date: d.date }
        : { email: d.email, event: d.event, date: d.date },
      update: { $setOnInsert: d },
      upsert: true,
    },
  }));
  const res = await EmailEvent.bulkWrite(ops, { ordered: false });
  return res.upsertedCount || 0;
};

const run = async () => {
  if (!DB_URI) throw new Error("DB_URI is not set");
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set");

  await mongoose.connect(DB_URI);
  console.log(`✅ Mongo connected. Backfilling last ${BACKFILL_DAYS} day(s)…`);

  const now = new Date();
  const overallStart = new Date(now);
  overallStart.setDate(overallStart.getDate() - BACKFILL_DAYS);

  let totalSeen = 0;
  let totalInserted = 0;

  // Walk forward from overallStart in ≤90-day windows.
  let winStart = new Date(overallStart);
  while (winStart <= now) {
    const winEnd = new Date(winStart);
    winEnd.setDate(winEnd.getDate() + WINDOW_DAYS - 1);
    if (winEnd > now) winEnd.setTime(now.getTime());

    const startDate = ymd(winStart);
    const endDate = ymd(winEnd);
    console.log(`\n📆 Window ${startDate} → ${endDate}`);

    let offset = 0;
    for (;;) {
      const events = await fetchPage(startDate, endDate, offset);
      if (!events.length) break;

      totalSeen += events.length;
      const docs = events.map(mapEvent).filter(Boolean);
      const inserted = await upsertEvents(docs);
      totalInserted += inserted;
      console.log(`   offset ${offset}: fetched ${events.length}, new ${inserted}`);

      if (events.length < PAGE_LIMIT) break; // last page for this window
      offset += PAGE_LIMIT;
      await sleep(300); // be gentle with rate limits
    }

    // Next window starts the day after this one ended.
    winStart = new Date(winEnd);
    winStart.setDate(winStart.getDate() + 1);
  }

  console.log(`\n✅ Done. Events seen: ${totalSeen}. New rows inserted: ${totalInserted}.`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("❌ Backfill failed:", err.response?.data || err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
