// scripts/textWehoLeads.js
//
// One-off, run by hand on the Render shell: the follow-up text to every WeHo lead for 960 Larrabee St
// (West Hollywood), same idea as scripts/textSf241Leads.js. Wording is the SF text, with no time of day:
//
//   "Hi {first name}, it's Maya from Vihara. The West Hollywood condo you asked about (960 Larrabee St) goes to
//    auction on {Dec 6}, starting at {$450K}. Want me to send you the link to register? Reply STOP to opt out."
//
// The date and the starting price are read from the live product (slug below) when the script runs, so they are
// never typed in by hand. No starting bid on the product: the price part is left out. No auction date, or an
// auction that is already over: the script refuses to run.
//
// Who (all of them, each phone number once):
//   - property page registrations and /deal sign-ups (propertyLead with this propertySlug)
//   - Facebook / Instagram form leads of the WeHo forms (formName matches /weho|west hollywood|larrabee/, or
//     --fb-form-ids=<id,id> to name them exactly)
//   People who only commented "WeHo" have no phone number in our data, so they cannot be texted.
//   Someone who already got a text from us is texted anyway (Prajwal / the user said yes, as for SF).
//   Skipped: test leads, no usable first name, no valid US number, opted out, bad number, a repeat phone number.
//
// It goes through the normal Vtext path (enqueueOutbound), so everything the other texts obey applies:
//   - Consent: the Vtext consent switch decides. ON: a number with no SMS consent on file is BLOCKED (and shown
//     as blocked). OFF: it goes out. Opt-outs and bad numbers always block.
//   - Line: iMessage first (info and Emily lines, within their daily limits), Twilio SMS when iMessage cannot
//     take it (line full, rejected, no receipt), as for every text. A lead whose earlier thread is on Twilio SMS
//     stays on Twilio SMS, so the text does not come from a different iMessage number.
//   - Hours: 9 AM-8 PM in the lead's own time zone (an unknown area code: inside both ET and PT).
//   - Pace: 3 to 5 minutes between one person and the next, so it reads as one person texting, not a blast.
//
// Safe to run twice: each phone number's text has a fixed key, so a second run adds nothing.
// This only QUEUES the texts. The Vtext workers deliver them. A run without --send writes nothing.
// MUST run where DB_URI and REDIS_URL are the live ones (the Render shell).
//
//   node src/scripts/textWehoLeads.js             # dry run: who, what text, when, and whether consent would block
//   node src/scripts/textWehoLeads.js --send      # queue them
//   Options: --limit=N (at most N people this run, the rest on a later run: keys stop repeats)
//            --at=<ISO time> (do not start before this), --fb-form-ids=<id,id>, --only=<phone,phone>

require("dotenv").config();
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const { toUsSmsNumber } = require("../utils/usPhone");
const { nextTextingTime } = require("../utils/textingHours");
const { firstNameOf } = require("../services/leads/facebookIntroText");

const SLUG = "960-larrabee-st-west-hollywood";
const ADDRESS = "960 Larrabee St";
const TEMPLATE_KEY = "weho-960-larrabee-auction-text";
const BATCH_PREFIX = "weho-960-larrabee";
const FB_FORM_NAME = /weho|west hollywood|larrabee/i;
const GAP_MIN_MS = 3 * 60_000;
const GAP_MAX_MS = 5 * 60_000;

const arg = (argv, name) => (argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const masked = (phone) => `${phone.slice(0, 2)}***${phone.slice(-4)}`;
const keyFor = (phone) => `${TEMPLATE_KEY}-${phone.replace(/\D/g, "")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 450000 -> "$450K", 1250000 -> "$1.25M". null when there is no usable price. */
function priceWord(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1_000_000) return `$${String(+(v / 1_000_000).toFixed(2))}M`;
  return `$${String(+(v / 1000).toFixed(1))}K`;
}

/** The auction date as people say it in California: "Dec 6". */
function dateWord(date) {
  return DateTime.fromJSDate(new Date(date)).setZone("America/Los_Angeles").toFormat("LLL d");
}

/** @param {{ first: string, startDate: Date, startBid?: number }} p */
function textFor({ first, startDate, startBid }) {
  const price = priceWord(startBid);
  return `Hi ${first}, it's Maya from Vihara. The West Hollywood condo you asked about (${ADDRESS}) goes to auction on ${dateWord(startDate)}${price ? `, starting at ${price}` : ""}. Want me to send you the link to register? Reply STOP to opt out.`;
}

/** The real database and queue. Tests pass their own. */
function liveDeps() {
  const PropertyLead = require("../model/leads/propertyLeadModel");
  const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
  const Product = require("../model/property/productModel");
  const VtextMessage = require("../model/vtext/vtextMessageModel");
  const VtextContact = require("../model/vtext/vtextContactModel");
  const VtextConversation = require("../model/vtext/vtextConversationModel");
  const { enqueueOutbound } = require("../services/vtext/vtextMessageService");
  const { getSettings, isConsentRequired } = require("../services/vtext/vtextSettingsService");
  const { pingRedis } = require("../services/vtext/queue/connection");
  return {
    async loadProduct() {
      return Product.findOne({ slug: SLUG }).select("slug productName auctionStartDate auctionEndDate startBid").lean();
    },
    async loadLeads({ fbFormIds }) {
      const property = await PropertyLead.find({ propertySlug: SLUG, isQaTest: { $ne: true } })
        .select("fullName phone phoneNormalized email smsConsent createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      const fbQuery = fbFormIds.length ? { formId: { $in: fbFormIds } } : { formName: FB_FORM_NAME };
      const facebook = await FacebookFormLead.find({ ...fbQuery, isTest: { $ne: true }, leadStatus: { $ne: "disqualified" } })
        .select("fullName firstName phone phoneNormalized email smsConsent formId formName createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      return [
        ...property.map((l) => ({ ...l, from: "property page" })),
        ...facebook.map((l) => ({ ...l, from: `Facebook form ${l.formName || l.formId}` })),
      ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },
    async lookups(phones) {
      const contacts = await VtextContact.find({ phoneE164: { $in: phones } }).select("phoneE164 optOut consent phoneStatus").lean();
      const byPhone = new Map(contacts.map((c) => [c.phoneE164, c]));
      const sameKey = new Set((await VtextMessage.find({ idempotencyKey: { $in: phones.map(keyFor) } }).select("idempotencyKey").lean()).map((m) => m.idempotencyKey));
      const convs = await VtextConversation.find({ contactId: { $in: contacts.map((c) => c._id) } }).sort({ lastMessageAt: 1 }).select("contactId channelType lineAddress counts").lean();
      const threads = new Map();
      for (const c of convs) threads.set(String(c.contactId), { channelType: c.channelType, lineAddress: c.lineAddress, inbound: c.counts?.inbound || 0 });
      return { byPhone, sameKey, threads };
    },
    async consentRequired() {
      return isConsentRequired(await getSettings());
    },
    pingRedis,
    enqueueOutbound,
  };
}

/** @param {object} [opts] - { argv, clock, random, gapMs, log, deps } (tests inject them; the CLI passes none) */
async function run({ argv = process.argv.slice(2), clock = () => new Date(), random = Math.random, gapMs = 1000, log = console.log, deps = liveDeps() } = {}) {
  const now = clock();
  const SEND = argv.includes("--send");
  const limit = Number(arg(argv, "limit")) || 0;
  const fbFormIds = arg(argv, "fb-form-ids").split(",").map((s) => s.trim()).filter(Boolean);
  const onlyPhones = arg(argv, "only").split(",").map((s) => toUsSmsNumber(s.trim())).filter(Boolean);
  const base = arg(argv, "at") ? new Date(arg(argv, "at")) : now;
  if (Number.isNaN(base.getTime())) throw new Error("--at is not a valid time");
  const batchId = `${BATCH_PREFIX}-${now.toISOString().slice(0, 10)}`;
  const out = { counted: 0, sendable: [], skipped: [], queued: [], blocked: [], failed: [] };

  const product = await deps.loadProduct();
  if (!product) throw new Error(`No product with slug ${SLUG}: nothing to say about the auction.`);
  const startDate = product.auctionStartDate || product.auctionEndDate;
  if (!startDate) throw new Error("The product has no auction date: not texting.");
  if (new Date(product.auctionEndDate || startDate) < now) throw new Error("The auction is already over: not texting.");
  log(`Product: ${product.productName || SLUG}. Auction date ${dateWord(startDate)}, starting bid ${priceWord(product.startBid) || "none (price left out of the text)"}.`);

  const leads = await deps.loadLeads({ fbFormIds });
  out.counted = leads.length;
  const sources = {};
  for (const l of leads) sources[l.from] = (sources[l.from] || 0) + 1;
  log(`Leads found: ${leads.length} ${JSON.stringify(sources)}`);

  // One person per phone number: the first lead with a usable name and a valid number wins.
  const seen = new Set();
  const people = [];
  for (const l of leads) {
    const phone = toUsSmsNumber(l.phoneNormalized) || toUsSmsNumber(l.phone);
    const label = `${l.fullName || l.email || String(l._id)} (${l.from})`;
    if (!phone) { out.skipped.push({ name: label, reason: "not a valid US number" }); continue; }
    if (onlyPhones.length && !onlyPhones.includes(phone)) continue;
    if (seen.has(phone)) { out.skipped.push({ name: label, phone, reason: "same number as an earlier lead" }); continue; }
    const first = firstNameOf(l);
    if (!first) { out.skipped.push({ name: label, phone, reason: "no usable first name" }); continue; }
    seen.add(phone);
    people.push({ name: l.fullName || first, label, phone, first, from: l.from });
  }

  const look = await deps.lookups(people.map((p) => p.phone));
  const consentOn = await deps.consentRequired();

  let earliest = base; // each person goes out a 3-5 minute gap after the one before
  for (const p of people) {
    const contact = look.byPhone.get(p.phone);
    const skip = (reason) => out.skipped.push({ name: p.label, phone: p.phone, reason });
    if (look.sameKey.has(keyFor(p.phone))) { skip("already queued or sent by this script"); continue; }
    if (contact?.optOut?.isOptedOut) { skip("opted out"); continue; }
    if (["bad", "invalid", "landline"].includes(contact?.phoneStatus)) { skip(`marked as a bad number (${contact.phoneStatus})`); continue; }
    if (limit > 0 && out.sendable.length >= limit) { skip("over --limit, left for a later run"); continue; }
    const thread = contact ? look.threads?.get(String(contact._id)) : null;
    const sendAt = nextTextingTime(p.phone, earliest).at;
    earliest = new Date(sendAt.getTime() + GAP_MIN_MS + Math.floor(random() * (GAP_MAX_MS - GAP_MIN_MS)));
    out.sendable.push({
      ...p,
      text: textFor({ first: p.first, startDate, startBid: product.startBid }),
      sendAt,
      consent: contact?.consent?.status || "no contact yet",
      thread,
      onSms: thread?.channelType === "twilio-sms",
    });
  }

  log(consentOn
    ? "Vtext consent switch is ON: a number with no SMS consent on file will be BLOCKED."
    : "Vtext consent switch is OFF: no consent needed (opt-outs and bad numbers still block).");
  log(`\n${out.sendable.length} to text${SEND ? "" : " (DRY RUN, nothing is written)"}:`);
  for (const s of out.sendable) {
    const th = s.thread ? `${s.thread.channelType}${s.thread.lineAddress ? ` ${s.thread.lineAddress}` : ""}, ${s.thread.inbound} repl${s.thread.inbound === 1 ? "y" : "ies"}` : "none";
    log(`  ${s.name}  ${masked(s.phone)}  ${s.from}  consent: ${s.consent}  earlier thread: ${th}${s.onSms ? " (will go by Twilio SMS)" : ""}  goes out ${s.sendAt.toISOString()}\n      ${s.text}`);
  }
  log(`\n${out.skipped.length} skipped:`);
  for (const s of out.skipped) log(`  ${s.name}${s.phone ? ` ${masked(s.phone)}` : ""}: ${s.reason}`);

  if (!SEND) {
    log(`\nDry run only. To queue these ${out.sendable.length} texts: node src/scripts/textWehoLeads.js --send`);
    return out;
  }
  if (!out.sendable.length) { log("\nNothing to send."); return out; }
  if (!(await deps.pingRedis())) {
    log("\nNot sending: Redis (REDIS_URL) is not reachable, so the texts could not be queued for the workers.");
    return { ...out, refused: "redis unreachable" };
  }

  log(`\nQueuing ${out.sendable.length} texts (batch ${batchId})...`);
  for (let i = 0; i < out.sendable.length; i++) {
    const s = out.sendable[i];
    try {
      const { message, blocked, reason } = await deps.enqueueOutbound({
        to: s.phone,
        body: s.text,
        origin: { kind: "bulk", templateKey: TEMPLATE_KEY, batchId },
        contactName: s.name,
        idempotencyKey: keyFor(s.phone),
        scheduledFor: s.sendAt,
        channelPolicy: s.onSms ? { mode: "only", channels: ["twilio-sms"] } : undefined,
      });
      if (blocked) {
        out.blocked.push({ name: s.name, messageId: String(message._id), reason });
        log(`  BLOCKED ${s.name}: ${reason}`);
      } else {
        out.queued.push({ name: s.name, messageId: String(message._id) });
        log(`  queued  ${s.name}: message ${message._id}, goes out ${s.sendAt.toISOString()}`);
      }
    } catch (err) {
      const dup = err?.code === 11000;
      out.failed.push({ name: s.name, error: dup ? "duplicate key" : err.message });
      log(`  ${dup ? "SKIPPED (duplicate key)" : "FAILED"} ${s.name}: ${err.message}`);
    }
    if (i < out.sendable.length - 1) await sleep(gapMs);
  }
  log(`\nSummary: ${out.queued.length} queued, ${out.blocked.length} blocked, ${out.skipped.length} skipped, ${out.failed.length} failed.`);
  log(`These are only QUEUED. The Vtext workers deliver them (Vtext dashboard, batch ${batchId}).`);
  return out;
}

module.exports = { run, textFor, priceWord, dateWord, SLUG };

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
