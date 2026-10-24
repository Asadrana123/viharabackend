// scripts/textFacebookFormLeads.js
//
// One-off, run by hand: send the Facebook / Instagram form leads (Admin ->
// Leads -> "Facebook Forms") one intro text through Vtext:
//
//   Hi {First_name}, this is Maya from Vihara. Got it: homes up to {price_range}.
//   I'll text you bank-owned deals that fit first. Reply STOP to opt out.
//
// This script only QUEUES the texts (enqueueOutbound -> the Vtext route queue
// in Redis). The Vtext workers running on the server pick them up and deliver
// them, through the normal line / capacity logic. They show in the Vtext
// dashboard as bulk sends, batch "fb-intro-<date>", template "facebook-form-intro".
//
// Safe to run twice: each lead's message carries the key fb-intro-text-<leadId>,
// and a lead (or phone number) that already has one is skipped.
// A lead is skipped, with the reason printed, when it has no first name, no
// price-range answer, no valid US number, was stopped by an admin, has opted
// out of texts, or shares a phone number with an earlier lead.
//
// Only sends between 11 AM and 9 PM Eastern (= 8 AM-9 PM Pacific); outside that
// it refuses. There is no override.
//
// MUST run where DB_URI and REDIS_URL are the same ones the live Vtext workers
// use (e.g. a shell on the server). Run against production from a laptop and it
// queues REAL messages. A run without --send never writes anything.
//
//   node src/scripts/textFacebookFormLeads.js --dry     # list + rendered texts only (also the default)
//   node src/scripts/textFacebookFormLeads.js --send    # queue them
//   Options: --only=<leadId,leadId> (just these leads), --limit=N (at most N sends)

require("dotenv").config();
const mongoose = require("mongoose");
const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
const VtextMessage = require("../model/vtext/vtextMessageModel");
const VtextContact = require("../model/vtext/vtextContactModel");
const { enqueueOutbound } = require("../services/vtext/vtextMessageService");
const { getSettings, isConsentRequired } = require("../services/vtext/vtextSettingsService");
const { pingRedis } = require("../services/vtext/queue/connection");
const { splitName } = require("../services/leads/buyBox");
const { toUsSmsNumber } = require("../utils/usPhone");

const TEMPLATE_KEY = "facebook-form-intro";
const GAP_MS = 1000;
const CONTACT_KEYS = /^(full_name|first_name|last_name|email|phone_number|phone)$/;
// The owner's exact wording, with the curly apostrophe.
const TEMPLATE = "Hi {First_name}, this is Maya from Vihara. Got it: homes up to {price_range}. I’ll text you bank-owned deals that fit first. Reply STOP to opt out.";

const keyFor = (leadId) => `fb-intro-text-${leadId}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/** "jOHN" / "JOHN" / "john" -> "John"; "McDonald", "Mary-Ann", "O'Neil" keep/get sensible case. */
function capitalise(name) {
  const letters = name.replace(/[^A-Za-z]/g, "");
  const mixed = letters !== letters.toLowerCase() && letters !== letters.toUpperCase();
  if (mixed) return name.charAt(0).toUpperCase() + name.slice(1);
  return name.toLowerCase().replace(/(^|[-'’])([a-z])/g, (m, sep, c) => sep + c.toUpperCase());
}

/** The lead's first name, or null when there is no real one (never "there", never an email name). */
function firstNameOf(lead) {
  let first = splitName(lead.fullName).firstName;
  if (!first) {
    // No full name: only trust firstName when it is not the importer's fallback (email name, or "there").
    const emailName = String(lead.email || "").split("@")[0];
    const f = String(lead.firstName || "").trim();
    if (f && f.toLowerCase() !== "there" && f !== emailName) first = f;
  }
  first = String(first || "").replace(/[.,]+$/, "");
  if (!/^[A-Za-z][A-Za-z'’-]*$/.test(first)) return null; // blank, digits, emails, emoji, initials with dots
  if (first.length < 2) return null;
  return capitalise(first);
}

/** The price-range answer's label as the buyer saw it (falls back to the raw value only if it is itself a $ figure). */
function priceRangeOf(lead) {
  const a = (lead.answers || []).find((x) => !CONTACT_KEYS.test(x.key) && /price|budget|range/i.test(x.key));
  if (!a) return null;
  const label = String(a.label || "").trim();
  if (label) return label;
  const value = String(a.value || "").trim();
  return value.includes("$") ? value : null;
}

/** True when "homes up to <label>" reads wrong (ranges, "Under X", "X+", "not sure"...). */
function upToReadsWrong(label) {
  return /[–—-]|\bto\b|under|below|less|up to|over|more|plus|\+|above|sure|any/i.test(label);
}

/** { text } or { skip: reason } */
function renderIntro(lead) {
  const first = firstNameOf(lead);
  if (!first) return { skip: "no usable first name" };
  const price = priceRangeOf(lead);
  if (!price) return { skip: "no price-range answer" };
  const text = TEMPLATE.replace("{First_name}", () => first).replace("{price_range}", () => price);
  if (/[{}]/.test(text)) return { skip: "unresolved placeholder in text" };
  return { text, first, price };
}

/** Is it inside texting hours in BOTH US Eastern and US Pacific (8 AM-9 PM each)? */
function textingWindow(now) {
  const hourIn = (tz) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const et = hourIn("America/New_York");
  const pt = hourIn("America/Los_Angeles");
  const ok = et >= 8 && et < 21 && pt >= 8 && pt < 21;
  return { ok, et, pt };
}

/**
 * Decide, per lead, whether it gets the text. Pure apart from the lookups it is handed.
 * @param {object[]} leads - FacebookFormLead docs, oldest first
 * @param {object} lookups - { contactsByPhone: Map, sentByKey: Map(key -> message), sentToContact: Set(phone) }
 * @returns {{ sendable: object[], skipped: object[] }}
 */
function planLeads(leads, { contactsByPhone, sentByKey, phonesAlreadyTexted }) {
  const sendable = [];
  const skipped = [];
  const seenPhone = new Map();
  for (const lead of leads) {
    const id = String(lead._id);
    const skip = (reason) => skipped.push({ id, reason });

    const phone = toUsSmsNumber(lead.phoneNormalized) || toUsSmsNumber(lead.phone);
    if (!phone) { skip("no valid US phone number"); continue; }
    if (seenPhone.has(phone)) { skip(`same phone as earlier lead ${seenPhone.get(phone)}`); continue; }
    seenPhone.set(phone, id);

    const prior = sentByKey.get(keyFor(id));
    if (prior) { skip(`already handled (message ${prior._id}, status ${prior.status})`); continue; }
    if (phonesAlreadyTexted.has(phone)) { skip("this number already got the intro text (another lead record)"); continue; }
    if (lead.callingStopped) { skip("admin stopped contact (callingStopped)"); continue; }

    const contact = contactsByPhone.get(phone);
    if (contact?.optOut?.isOptedOut || contact?.consent?.status === "opted-out") { skip("contact opted out of texts"); continue; }
    if (contact?.phoneStatus === "invalid" || contact?.phoneStatus === "landline") { skip(`bad number (phone status "${contact.phoneStatus}")`); continue; }

    const r = renderIntro(lead);
    if (r.skip) { skip(r.skip); continue; }
    sendable.push({ lead, id, phone, ...r });
  }
  return { sendable, skipped };
}

// ─── Run ────────────────────────────────────────────────────────────────────

const arg = (argv, name) => (argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);

/**
 * @param {object} [opts] - { argv, clock, gapMs, log } (tests inject clock/gapMs/log; the CLI passes none)
 */
async function run({ argv = process.argv.slice(2), clock = () => new Date(), gapMs = GAP_MS, log = console.log } = {}) {
  const now = clock();
  const SEND = argv.includes("--send");
  const only = arg(argv, "only").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = Number(arg(argv, "limit")) || 0;
  const batchId = `fb-intro-${now.toISOString().slice(0, 10)}`;
  const out = { counted: 0, skipped: [], queued: [], blocked: [], failed: [], sendable: [] };

  if (SEND) {
    const w = textingWindow(now);
    if (!w.ok) {
      log(`Not sending: it is ${w.et}:00 Eastern / ${w.pt}:00 Pacific. Texts only go out 8 AM-9 PM in BOTH (11 AM-9 PM Eastern). Run again then.`);
      return { ...out, refused: "outside texting hours" };
    }
  }

  const all = await FacebookFormLead.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  out.counted = all.length;

  const phones = [...new Set(all.map((l) => toUsSmsNumber(l.phoneNormalized) || toUsSmsNumber(l.phone)).filter(Boolean))];
  const contacts = await VtextContact.find({ phoneE164: { $in: phones } }).select("phoneE164 optOut consent phoneStatus").lean();
  const contactsByPhone = new Map(contacts.map((c) => [c.phoneE164, c]));
  const keys = all.map((l) => keyFor(l._id));
  const sent = await VtextMessage.find({ idempotencyKey: { $in: keys } }).select("idempotencyKey status").lean();
  const sentByKey = new Map(sent.map((m) => [m.idempotencyKey, m]));
  // Same person on two lead records: a text with this template to the contact already counts.
  const introMsgs = await VtextMessage.find({ "origin.templateKey": TEMPLATE_KEY, contactId: { $in: contacts.map((c) => c._id) } }).select("contactId").lean();
  const textedContactIds = new Set(introMsgs.map((m) => String(m.contactId)));
  const phonesAlreadyTexted = new Set(contacts.filter((c) => textedContactIds.has(String(c._id))).map((c) => c.phoneE164));

  let { sendable, skipped } = planLeads(all, { contactsByPhone, sentByKey, phonesAlreadyTexted });
  if (only.length) {
    const want = new Set(only);
    skipped = skipped.filter((s) => want.has(s.id));
    sendable = sendable.filter((s) => want.has(s.id));
    for (const id of only) if (!all.some((l) => String(l._id) === id)) skipped.push({ id, reason: "no such lead" });
  }
  if (limit > 0 && sendable.length > limit) sendable = sendable.slice(0, limit);
  out.skipped = skipped;
  out.sendable = sendable;

  const settings = await getSettings();
  log(`Facebook form leads: ${all.length} in the database. Consent check is ${isConsentRequired(settings) ? "ON (contacts without consent will be BLOCKED)" : "OFF (opt-outs and bad numbers still block)"}.`);
  log(`\n${sendable.length} to text${SEND ? "" : " (DRY RUN, nothing is written)"}:`);
  for (const s of sendable) log(`  [${s.id}] ${s.phone.slice(0, 2)}***${s.phone.slice(-4)}  ${s.text}`);

  const labels = new Map();
  for (const s of sendable) labels.set(s.price, (labels.get(s.price) || 0) + 1);
  log(`\nDistinct price-range labels in these texts (wording is "homes up to <label>"):`);
  for (const [label, n] of labels) log(`  ${n}x "${label}"${upToReadsWrong(label) ? "   <-- 'up to' may read wrong, please review" : ""}`);

  log(`\n${skipped.length} skipped:`);
  for (const s of skipped) log(`  [${s.id}] ${s.reason}`);

  if (!SEND) {
    log(`\nDry run only. To queue these ${sendable.length} texts: node src/scripts/textFacebookFormLeads.js --send`);
    return out;
  }
  if (!sendable.length) { log("\nNothing to send."); return out; }
  if (!(await pingRedis())) {
    log("\nNot sending: Redis (REDIS_URL) is not reachable, so the texts could not be queued for the workers.");
    return { ...out, refused: "redis unreachable" };
  }

  log(`\nQueuing ${sendable.length} texts (batch ${batchId}), about ${gapMs / 1000}s apart...`);
  for (let i = 0; i < sendable.length; i++) {
    const s = sendable[i];
    if (i > 0 && !textingWindow(clock()).ok) {
      log(`Stopped before lead ${s.id}: texting hours ended.`);
      break;
    }
    try {
      const { message, blocked, reason } = await enqueueOutbound({
        to: s.phone,
        body: s.text,
        origin: { kind: "bulk", templateKey: TEMPLATE_KEY, batchId },
        contactName: s.lead.fullName || s.first,
        idempotencyKey: keyFor(s.id),
      });
      if (blocked) {
        out.blocked.push({ id: s.id, messageId: String(message._id), reason });
        log(`  BLOCKED [${s.id}]: ${reason}`);
      } else {
        out.queued.push({ id: s.id, messageId: String(message._id) });
        log(`  queued  [${s.id}] message ${message._id}`);
      }
    } catch (err) {
      const dup = err?.code === 11000;
      out.failed.push({ id: s.id, error: dup ? "already has a message with this key (duplicate)" : err.message });
      log(`  ${dup ? "SKIPPED (duplicate key)" : "FAILED"} [${s.id}]: ${err.message}`);
    }
    if (i < sendable.length - 1) await sleep(gapMs);
  }

  log(`\nSummary: ${out.counted} leads counted, ${out.skipped.length} skipped, ${out.queued.length} queued, ${out.blocked.length} blocked, ${out.failed.length} failed.`);
  if (out.queued.length) log(`Queued message ids: ${out.queued.map((q) => q.messageId).join(", ")}`);
  log("These are only QUEUED. The Vtext workers running on the server deliver them (watch the Vtext dashboard, batch " + batchId + ").");
  return out;
}

module.exports = { run, renderIntro, firstNameOf, priceRangeOf, upToReadsWrong, textingWindow, planLeads, capitalise, keyFor, TEMPLATE };

if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });
    const { host, name } = mongoose.connection;
    console.log(`Database: ${name} on ${host}`);
    await run();
    await mongoose.disconnect();
    process.exit(0); // the Vtext queue keeps its Redis connection open
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
