// scripts/textSf241Leads.js
//
// One-off, run by hand on the Render shell: the follow-up text to the 5 SF leads for 241 10th St, going out at
// 10:00 AM PT on 25 Nov 2026, one hour before bidding opens (11 AM PT). Prajwal's list and wording, with one change:
// no link, because a first text carries none (it asks "Want me to send you the link?" and Maya sends it after a reply).
//
// Text: "Hi {first name}, it's Maya from Vihara. The SF condo you asked about (241 10th St) goes to auction today at
//        11 AM PT, starting at $795K. Want me to send you the link to register? Reply STOP to opt out."
//
// It goes through the normal Vtext path (enqueueOutbound), so everything the other texts obey applies here too:
//   - Consent: the Vtext consent switch decides, as for every text. Switch ON: a number with no SMS consent on file
//     is BLOCKED (and shown as blocked). Switch OFF: it goes out (opt-outs and bad numbers still block).
//   - Line: iMessage first (info / Emily lines, least used first), Twilio SMS if iMessage can't take it.
//   - Opt-outs, bad numbers: blocked as always.
// Leah (hot, pre-approved) is first in the queue; each next one follows 3 to 5 minutes after the one before (so all 5 are out by about 10:20).
//
// These 5 already got the automatic first text when they signed up, and Prajwal said yes to a follow-up anyway
// (25 Nov), so a number with an earlier text is NOT skipped. Opt-outs and bad numbers still are.
// Same thread: a lead whose earlier thread is on the Twilio SMS line gets this text on Twilio SMS too (pinned), so it
// does not arrive from a different, iMessage number. A lead on iMessage stays on the same iMessage line (the router
// keeps the line per person), and the SMS fallback still works for them.
//
// Safe to run twice: each person's text has a fixed key, so a second run adds nothing.
//
// This only QUEUES the texts. The Vtext workers deliver them at the set time. A run without --send writes nothing.
// MUST run where DB_URI and REDIS_URL are the live ones (the Render shell).
//
//   node src/scripts/textSf241Leads.js            # dry run: who, what, when, and whether consent would block
//   node src/scripts/textSf241Leads.js --send     # queue them for 10:00 AM PT
//   Options: --at=<ISO time> (a different send time, default 2026-11-25T18:00:00Z = 10:00 AM PT)

require("dotenv").config();
const mongoose = require("mongoose");
const { toUsSmsNumber } = require("../utils/usPhone");
const { nextTextingTime } = require("../utils/textingHours");

const SEND_AT = "2026-11-25T18:00:00Z"; // 10:00 AM PT (PST, UTC-8) = 11:30 PM IST
// Gap between one person and the next: a random 3 to 5 minutes, so it reads as one person texting, not a blast.
const GAP_MIN_MS = 3 * 60_000;
const GAP_MAX_MS = 5 * 60_000;
const TEMPLATE_KEY = "sf-241-auction-text";
const BATCH_ID = "sf-241-10th-st-2026-11-25";

// In sending order: Leah first.
const LEADS = [
  { name: "Leah Ryu", phone: "+1 (628) 488-7448", note: "hot, pre-approved" },
  { name: "Humberto Bravo", phone: "+1 (415) 504-0959" },
  { name: "Thelma Phillips", phone: "+1 (415) 368-9466" },
  { name: "Craig Lee Oney", phone: "+1 (530) 708-7415" },
  { name: "Maxine Ramos", phone: "+1 (628) 267-7123" },
];

const arg = (argv, name) => (argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const masked = (phone) => `${phone.slice(0, 2)}***${phone.slice(-4)}`;
const keyFor = (phone) => `${TEMPLATE_KEY}-${phone.replace(/\D/g, "")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function textFor(first) {
  return `Hi ${first}, it's Maya from Vihara. The SF condo you asked about (241 10th St) goes to auction today at 11 AM PT, starting at $795K. Want me to send you the link to register? Reply STOP to opt out.`;
}

/** The real database and queue. Tests pass their own. */
function liveDeps() {
  const VtextMessage = require("../model/vtext/vtextMessageModel");
  const VtextContact = require("../model/vtext/vtextContactModel");
  const VtextConversation = require("../model/vtext/vtextConversationModel");
  const { enqueueOutbound } = require("../services/vtext/vtextMessageService");
  const { getSettings, isConsentRequired } = require("../services/vtext/vtextSettingsService");
  const { pingRedis } = require("../services/vtext/queue/connection");
  return {
    async lookups(phones) {
      const contacts = await VtextContact.find({ phoneE164: { $in: phones } }).select("phoneE164 optOut consent phoneStatus").lean();
      const byPhone = new Map(contacts.map((c) => [c.phoneE164, c]));
      const keys = phones.map(keyFor);
      const sameKey = new Set((await VtextMessage.find({ idempotencyKey: { $in: keys } }).select("idempotencyKey").lean()).map((m) => m.idempotencyKey));
      // The most recent thread each person has: which channel and which line it is on.
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
  const base = new Date(arg(argv, "at") || SEND_AT);
  if (Number.isNaN(base.getTime())) throw new Error("--at is not a valid time");
  const out = { sendable: [], skipped: [], queued: [], blocked: [], failed: [] };

  const people = LEADS.map((l) => ({ ...l, phoneE164: toUsSmsNumber(l.phone), first: l.name.split(" ")[0] }));
  const good = people.filter((p) => p.phoneE164);
  for (const p of people.filter((p) => !p.phoneE164)) out.skipped.push({ name: p.name, reason: "not a valid US number" });
  const look = await deps.lookups(good.map((p) => p.phoneE164));
  const consentOn = await deps.consentRequired();

  let offset = 0; // ms after the first text
  for (const p of good) {
    const contact = look.byPhone.get(p.phoneE164);
    const skip = (reason) => out.skipped.push({ name: p.name, phone: p.phoneE164, reason });
    if (look.sameKey.has(keyFor(p.phoneE164))) { skip("already queued or sent by this script"); continue; }
    if (contact?.optOut?.isOptedOut) { skip("opted out"); continue; }
    if (["bad", "invalid", "landline"].includes(contact?.phoneStatus)) { skip(`marked as a bad number (${contact.phoneStatus})`); continue; }
    const thread = contact ? look.threads?.get(String(contact._id)) : null;
    // Wanted time, pushed out only if it would land outside 9 AM-8 PM for the lead's own time zone.
    const wanted = new Date(base.getTime() + offset);
    const hold = nextTextingTime(p.phoneE164, new Date(Math.max(wanted.getTime(), now.getTime())));
    const sendAt = hold.at;
    offset += GAP_MIN_MS + Math.floor(random() * (GAP_MAX_MS - GAP_MIN_MS));
    const consent = contact?.consent?.status || "no contact yet";
    const onSms = thread?.channelType === "twilio-sms";
    out.sendable.push({ ...p, text: textFor(p.first), sendAt, consent, thread, onSms });
  }

  log(consentOn
    ? "Vtext consent switch is ON: a number with no SMS consent on file will be BLOCKED."
    : "Vtext consent switch is OFF: no consent needed (opt-outs and bad numbers still block).");
  log(`\n${out.sendable.length} to text${SEND ? "" : " (DRY RUN, nothing is written)"}:`);
  for (const s of out.sendable) log(`  ${s.name}${s.note ? ` (${s.note})` : ""}  ${masked(s.phoneE164)}  consent: ${s.consent}  earlier thread: ${s.thread ? `${s.thread.channelType}${s.thread.lineAddress ? ` ${s.thread.lineAddress}` : ""}, ${s.thread.inbound} repl${s.thread.inbound === 1 ? "y" : "ies"}` : "none"}${s.onSms ? " (will go by Twilio SMS)" : ""}  goes out ${s.sendAt.toISOString()}\n      ${s.text}`);
  log(`\n${out.skipped.length} skipped:`);
  for (const s of out.skipped) log(`  ${s.name}: ${s.reason}`);

  if (!SEND) {
    log(`\nDry run only. To queue these ${out.sendable.length} texts: node src/scripts/textSf241Leads.js --send`);
    return out;
  }
  if (!out.sendable.length) { log("\nNothing to send."); return out; }
  if (!(await deps.pingRedis())) {
    log("\nNot sending: Redis (REDIS_URL) is not reachable, so the texts could not be queued for the workers.");
    return { ...out, refused: "redis unreachable" };
  }

  log(`\nQueuing ${out.sendable.length} texts (batch ${BATCH_ID})...`);
  for (let i = 0; i < out.sendable.length; i++) {
    const s = out.sendable[i];
    try {
      const { message, blocked, reason } = await deps.enqueueOutbound({
        to: s.phoneE164,
        body: s.text,
        origin: { kind: "bulk", templateKey: TEMPLATE_KEY, batchId: BATCH_ID },
        contactName: s.name,
        idempotencyKey: keyFor(s.phoneE164),
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
  log(`These are only QUEUED. The Vtext workers deliver them (Vtext dashboard, batch ${BATCH_ID}).`);
  return out;
}

module.exports = { run, textFor, LEADS };

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
