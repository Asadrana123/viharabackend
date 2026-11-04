// scripts/textToorakLeads.js
//
// One-off, run by hand on the Render shell: text the Toorak leads (config/toorakForms.js) that never got
// the automatic intro text, because they came in before it was switched on. They get the very same text as
// the automatic one (TOORAK_TEMPLATES in services/leads/facebookIntroText.js, Prajwal's wording): the home
// by address with the sale day until that home's sale starts, or the financing text with the advisor link.
//
// Who is skipped (reason printed): test leads, disqualified leads, no first name, no valid US number, a
// property form not in config/toorakForms.js, admin stopped contact, opted out, bad number, a second lead
// with the same number, and any lead or number that already got an intro text (Toorak or not) or any other
// text from us. So nobody we are already texting gets a first text again.
//
// Texting hours: 9 AM-8 PM in the lead's own time zone, like the automatic text. A lead outside those hours
// is queued now with a send time (scheduledFor) of 9 AM their time, and the route worker holds it until then.
// Consent: the Vtext consent switch decides, as for the automatic text. With it ON, these leads (no text
// box ticked) are BLOCKED; the dry run says which way it is.
//
// Safe to run twice: each lead's text carries the same key as the automatic intro (fb-intro-text-<leadId>),
// so a lead gets one or the other, never both.
//
// This only QUEUES the texts. The Vtext workers on the server deliver them (Vtext dashboard, batch
// "toorak-catch-up-<date>", template "toorak-intro"), through the normal line / capacity logic.
// MUST run where DB_URI and REDIS_URL are the live ones (the Render shell). A run without --send writes nothing.
//
//   node src/scripts/textToorakLeads.js            # dry run: the list, each text and when it goes out
//   node src/scripts/textToorakLeads.js --send     # queue them
//   Options: --only=<leadId,leadId> (just these leads), --limit=N (at most N)

require("dotenv").config();
const mongoose = require("mongoose");
const { toUsSmsNumber } = require("../utils/usPhone");
const { nextTextingTime } = require("../utils/textingHours");
const { INTRO_TEMPLATE_KEYS, keyFor, renderIntro, planLeads } = require("../services/leads/facebookIntroText");

const GAP_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (argv, name) => (argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const masked = (phone) => `${phone.slice(0, 2)}***${phone.slice(-4)}`;

/** The real database and queue. Tests pass their own. */
function liveDeps() {
  const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
  const VtextMessage = require("../model/vtext/vtextMessageModel");
  const VtextContact = require("../model/vtext/vtextContactModel");
  const { enqueueOutbound } = require("../services/vtext/vtextMessageService");
  const { getSettings, isConsentRequired } = require("../services/vtext/vtextSettingsService");
  const { pingRedis } = require("../services/vtext/queue/connection");
  return {
    async loadLeads() {
      return FacebookFormLead.find({ toorak: { $ne: null }, isTest: { $ne: true }, leadStatus: { $ne: "disqualified" } })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
    },
    async lookups(leads) {
      const phones = [...new Set(leads.map((l) => toUsSmsNumber(l.phoneNormalized) || toUsSmsNumber(l.phone)).filter(Boolean))];
      const contacts = await VtextContact.find({ phoneE164: { $in: phones } }).select("phoneE164 optOut consent phoneStatus").lean();
      const contactsByPhone = new Map(contacts.map((c) => [c.phoneE164, c]));
      const sent = await VtextMessage.find({ idempotencyKey: { $in: leads.map((l) => keyFor(l._id)) } }).select("idempotencyKey status").lean();
      const sentByKey = new Map(sent.map((m) => [m.idempotencyKey, m]));
      const contactIds = contacts.map((c) => c._id);
      const introIds = new Set((await VtextMessage.find({ "origin.templateKey": { $in: INTRO_TEMPLATE_KEYS }, contactId: { $in: contactIds } }).distinct("contactId")).map(String));
      const anyOutIds = new Set((await VtextMessage.find({ direction: "out", contactId: { $in: contactIds } }).distinct("contactId")).map(String));
      const phonesFor = (ids) => new Set(contacts.filter((c) => ids.has(String(c._id))).map((c) => c.phoneE164));
      return { contactsByPhone, sentByKey, phonesAlreadyTexted: phonesFor(introIds), phonesWithAnyText: phonesFor(anyOutIds) };
    },
    async consentRequired() {
      return isConsentRequired(await getSettings());
    },
    pingRedis,
    enqueueOutbound,
  };
}

/**
 * @param {object} [opts] - { argv, clock, gapMs, log, deps } (tests inject them; the CLI passes none)
 */
async function run({ argv = process.argv.slice(2), clock = () => new Date(), gapMs = GAP_MS, log = console.log, deps = liveDeps() } = {}) {
  const now = clock();
  const SEND = argv.includes("--send");
  const only = arg(argv, "only").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = Number(arg(argv, "limit")) || 0;
  const batchId = `toorak-catch-up-${now.toISOString().slice(0, 10)}`;
  const out = { counted: 0, skipped: [], sendable: [], queued: [], blocked: [], failed: [] };

  const leads = await deps.loadLeads();
  out.counted = leads.length;
  const lookups = await deps.lookups(leads);
  let { sendable, skipped } = planLeads(leads, lookups, { now });

  // Anyone we already text in some other way (a manual text from the Leads tab, a reminder...) is left alone.
  const other = sendable.filter((s) => lookups.phonesWithAnyText?.has(s.phone));
  for (const s of other) skipped.push({ id: s.id, reason: "we already texted this number (another message)" });
  sendable = sendable.filter((s) => !other.includes(s));

  // Each lead's own send time, and the text as it reads then (the sale sentence drops once the sale starts).
  sendable = sendable.map((s) => {
    const hold = nextTextingTime(s.phone, now);
    const sendAt = hold.waited ? hold.at : null;
    const r = renderIntro(s.lead, sendAt || now);
    return { ...s, ...r, sendAt };
  });

  if (only.length) {
    const want = new Set(only);
    skipped = skipped.filter((s) => want.has(s.id));
    sendable = sendable.filter((s) => want.has(s.id));
    for (const id of only) if (!leads.some((l) => String(l._id) === id)) skipped.push({ id, reason: "no such Toorak lead" });
  }
  if (limit > 0 && sendable.length > limit) sendable = sendable.slice(0, limit);
  out.skipped = skipped;
  out.sendable = sendable;

  const consentOn = await deps.consentRequired();
  log(`Toorak leads: ${leads.length} in the database.`);
  log(consentOn
    ? "Vtext consent switch is ON: leads who did not tick the text box will be BLOCKED. Turn it OFF in Vtext -> Settings first if Prajwal wants them texted."
    : "Vtext consent switch is OFF: no text box needed (opt-outs and bad numbers still block).");

  const when = (s) => (s.sendAt ? `at ${s.sendAt.toISOString()} (9 AM their time)` : "now");
  log(`\n${sendable.length} to text${SEND ? "" : " (DRY RUN, nothing is written)"}:`);
  for (const s of sendable) log(`  [${s.id}] ${masked(s.phone)}  ${s.lead.toorak?.key || ""}  goes out ${when(s)}\n      ${s.text}`);
  log(`\n${skipped.length} skipped:`);
  for (const s of skipped) log(`  [${s.id}] ${s.reason}`);

  if (!SEND) {
    log(`\nDry run only. To queue these ${sendable.length} texts: node src/scripts/textToorakLeads.js --send`);
    return out;
  }
  if (!sendable.length) { log("\nNothing to send."); return out; }
  if (!(await deps.pingRedis())) {
    log("\nNot sending: Redis (REDIS_URL) is not reachable, so the texts could not be queued for the workers.");
    return { ...out, refused: "redis unreachable" };
  }

  log(`\nQueuing ${sendable.length} texts (batch ${batchId}), about ${gapMs / 1000}s apart...`);
  for (let i = 0; i < sendable.length; i++) {
    const s = sendable[i];
    try {
      const { message, blocked, reason } = await deps.enqueueOutbound({
        to: s.phone,
        body: s.text,
        origin: { kind: "bulk", templateKey: s.templateKey, batchId, leadRef: { leadType: "facebookForm", leadId: s.id } },
        contactName: s.lead.fullName || s.first,
        idempotencyKey: keyFor(s.id),
        scheduledFor: s.sendAt || undefined,
      });
      if (blocked) {
        out.blocked.push({ id: s.id, messageId: String(message._id), reason });
        log(`  BLOCKED [${s.id}]: ${reason}`);
      } else {
        out.queued.push({ id: s.id, messageId: String(message._id) });
        log(`  queued  [${s.id}] message ${message._id}, goes out ${when(s)}`);
      }
    } catch (err) {
      const dup = err?.code === 11000;
      out.failed.push({ id: s.id, error: dup ? "already has a message with this key (duplicate)" : err.message });
      log(`  ${dup ? "SKIPPED (duplicate key)" : "FAILED"} [${s.id}]: ${err.message}`);
    }
    if (i < sendable.length - 1) await sleep(gapMs);
  }

  log(`\nSummary: ${out.counted} Toorak leads, ${out.skipped.length} skipped, ${out.queued.length} queued, ${out.blocked.length} blocked, ${out.failed.length} failed.`);
  log(`These are only QUEUED. The Vtext workers deliver them (Vtext dashboard, batch ${batchId}).`);
  return out;
}

module.exports = { run };

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
