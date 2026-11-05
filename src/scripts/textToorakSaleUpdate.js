// scripts/textToorakSaleUpdate.js
//
// One-off, run by hand on the Render shell: tell every Toorak lead (config/toorakForms.js) that the online
// sale moved from Nov 7 to Sunday, Nov 15 (Prajwal, 5 Nov 2026). Wording and versions in
// services/leads/toorakSaleUpdateText.js:
//   property form lead            -> their home, its page link, the advisor call
//   financing form lead           -> the advisor call
//   registered on a Toorak home   -> "your registration still counts" (matched by email or phone to an
//                                    auction registration on one of the 6 homes, not rejected; their own
//                                    form's home first)
//
// Every Toorak lead gets it, texted before or not. Skipped (reason printed): test leads, disqualified leads,
// no first name, no valid US number, a property form not in config/toorakForms.js, admin stopped contact,
// opted out, bad number, a second lead with the same number, anyone who already got this update, and anyone
// whose sale would already have started by the time the text goes out.
//
// Texting hours: 9 AM-8 PM in the lead's own time zone. A lead outside those hours is queued now with a send
// time (scheduledFor) of 9 AM their time, and the route worker holds it until then.
// Consent: the Vtext consent switch decides, as for the intro text. With it ON, leads who did not tick the
// text box are BLOCKED; the dry run says which way it is.
//
// Safe to run twice: each lead's text carries the key toorak-nov15-update-<leadId>, and a lead or number that
// already has the update is skipped.
//
// This only QUEUES the texts. The Vtext workers on the server deliver them (Vtext dashboard, batch
// "toorak-nov15-update-<date>", template "toorak-nov15-update"), through the normal line / capacity logic.
// MUST run where DB_URI and REDIS_URL are the live ones (the Render shell). A run without --send writes nothing.
//
//   node src/scripts/textToorakSaleUpdate.js            # dry run: the list, each text and when it goes out
//   node src/scripts/textToorakSaleUpdate.js --send     # queue them
//   Options: --only=<leadId,leadId> (just these leads), --limit=N (at most N)

require("dotenv").config();
const mongoose = require("mongoose");
const { toUsSmsNumber } = require("../utils/usPhone");
const { nextTextingTime } = require("../utils/textingHours");
const { TOORAK_FORMS } = require("../config/toorakForms");
const { SALE_UPDATE_TEMPLATE_KEY, saleUpdateKeyFor, planSaleUpdate } = require("../services/leads/toorakSaleUpdateText");

const GAP_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (argv, name) => (argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const masked = (phone) => `${phone.slice(0, 2)}***${phone.slice(-4)}`;
const emailOf = (v) => String(v || "").trim().toLowerCase();

// The first sale start of all the homes: a financing lead's update must go out before it.
const FIRST_SALE = Object.values(TOORAK_FORMS)
  .map((f) => f.saleStartsAt)
  .filter(Boolean)
  .sort((a, b) => new Date(a) - new Date(b))[0];

/**
 * registeredFormFor(lead, phone): the Toorak home this person registered on (by email or phone), their own
 * form's home first. Pure; built from the registrations and the products of the Toorak homes.
 */
function registrationMatcher(registrations, productsById) {
  const byEmail = new Map();
  const byPhone = new Map();
  const add = (map, k, form) => { if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k).push(form); };
  for (const r of registrations) {
    if (r.status === "rejected") continue;
    const form = productsById.get(String(r.auctionId));
    if (!form) continue;
    add(byEmail, emailOf(r.email), form);
    add(byPhone, toUsSmsNumber(r.mobilePhone), form);
  }
  return (lead, phone) => {
    const forms = [...(byEmail.get(emailOf(lead.email)) || []), ...(byPhone.get(phone) || [])];
    if (!forms.length) return null;
    return forms.find((f) => f.key === lead.toorak?.key) || forms[0];
  };
}

/** The real database and queue. Tests pass their own. */
function liveDeps() {
  const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
  const VtextMessage = require("../model/vtext/vtextMessageModel");
  const VtextContact = require("../model/vtext/vtextContactModel");
  const Product = require("../model/property/productModel");
  const AuctionRegistration = require("../model/bidding/auctionRegistration");
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
      const sent = await VtextMessage.find({ idempotencyKey: { $in: leads.map((l) => saleUpdateKeyFor(l._id)) } }).select("idempotencyKey status").lean();
      const sentByKey = new Map(sent.map((m) => [m.idempotencyKey, m]));
      const updatedIds = new Set(
        (await VtextMessage.find({ "origin.templateKey": SALE_UPDATE_TEMPLATE_KEY, contactId: { $in: contacts.map((c) => c._id) } }).distinct("contactId")).map(String)
      );
      const phonesAlreadyUpdated = new Set(contacts.filter((c) => updatedIds.has(String(c._id))).map((c) => c.phoneE164));

      // Registrations on the Toorak homes.
      const forms = Object.values(TOORAK_FORMS).filter((f) => f.propertySlug);
      const products = await Product.find({ slug: { $in: forms.map((f) => f.propertySlug) } }).select("slug").lean();
      const productsById = new Map(products.map((p) => [String(p._id), forms.find((f) => f.propertySlug === p.slug)]));
      const registrations = await AuctionRegistration.find({ auctionId: { $in: products.map((p) => p._id) } })
        .select("auctionId email mobilePhone status")
        .lean();
      return { contactsByPhone, sentByKey, phonesAlreadyUpdated, registeredFormFor: registrationMatcher(registrations, productsById), homesFound: products.length, registrations: registrations.length };
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
  const batchId = `${SALE_UPDATE_TEMPLATE_KEY}-${now.toISOString().slice(0, 10)}`;
  const out = { counted: 0, skipped: [], sendable: [], queued: [], blocked: [], failed: [] };

  const leads = await deps.loadLeads();
  out.counted = leads.length;
  const lookups = await deps.lookups(leads);
  let { sendable, skipped } = planSaleUpdate(leads, lookups);

  // Each lead's own send time; nobody hears "the sale moved" after it has started.
  const late = [];
  sendable = sendable.map((s) => {
    const hold = nextTextingTime(s.phone, now);
    return { ...s, sendAt: hold.waited ? hold.at : null };
  }).filter((s) => {
    const startsAt = s.saleStartsAt || FIRST_SALE;
    if (startsAt && (s.sendAt || now) >= new Date(startsAt)) { late.push(s); return false; }
    return true;
  });
  for (const s of late) skipped.push({ id: s.id, reason: "the sale will have started by the time this goes out" });

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
  if (lookups.homesFound !== undefined) log(`Registrations: ${lookups.registrations} on ${lookups.homesFound} of the Toorak homes.`);
  log(consentOn
    ? "Vtext consent switch is ON: leads who did not tick the text box will be BLOCKED. Turn it OFF in Vtext -> Settings first if Prajwal wants them texted."
    : "Vtext consent switch is OFF: no text box needed (opt-outs and bad numbers still block).");

  const versions = {};
  for (const s of sendable) versions[s.version] = (versions[s.version] || 0) + 1;
  const when = (s) => (s.sendAt ? `at ${s.sendAt.toISOString()} (9 AM their time)` : "now");
  log(`\n${sendable.length} to text${SEND ? "" : " (DRY RUN, nothing is written)"}: ${JSON.stringify(versions)}`);
  for (const s of sendable) log(`  [${s.id}] ${masked(s.phone)}  ${s.lead.toorak?.key || ""}  ${s.version}  goes out ${when(s)}\n      ${s.text}`);
  log(`\n${skipped.length} skipped:`);
  for (const s of skipped) log(`  [${s.id}] ${s.reason}`);

  if (!SEND) {
    log(`\nDry run only. To queue these ${sendable.length} texts: node src/scripts/textToorakSaleUpdate.js --send`);
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
        origin: { kind: "bulk", templateKey: SALE_UPDATE_TEMPLATE_KEY, batchId, leadRef: { leadType: "facebookForm", leadId: s.id } },
        contactName: s.lead.fullName || s.first,
        idempotencyKey: saleUpdateKeyFor(s.id),
        scheduledFor: s.sendAt || undefined,
      });
      if (blocked) {
        out.blocked.push({ id: s.id, messageId: String(message._id), reason });
        log(`  BLOCKED [${s.id}]: ${reason}`);
      } else {
        out.queued.push({ id: s.id, messageId: String(message._id) });
        log(`  queued  [${s.id}] message ${message._id}, ${s.version}, goes out ${when(s)}`);
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

module.exports = { run, registrationMatcher, FIRST_SALE };

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
