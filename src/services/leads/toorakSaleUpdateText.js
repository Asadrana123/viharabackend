// services/leads/toorakSaleUpdateText.js
//
// The one-off "the sale moved to Sunday, Nov 15" text (Prajwal, 5 Nov 2026), sent by hand with
// scripts/textToorakSaleUpdate.js. Three versions, Prajwal's exact wording:
//   property   a Toorak property form's lead: their home, its page link, the advisor call
//   financing  a Toorak financing form's lead: the advisor call
//   registered anyone registered on one of the 6 Toorak homes (Toorak lead or not): "your registration
//              still counts". A Toorak lead who also registered gets this one only.
// When a property lead has no page link, the link and the words "and register" go (Prajwal's rule).
//
// Who (Prajwal's answers, 5 Nov 2026): only people who opted in to texts, whatever the Vtext consent switch
// says, texted before or not. It counts as their first text: the normal intro never follows it
// (TOORAK_SALE_UPDATE_TEMPLATE_KEY is one of INTRO_TEMPLATE_KEYS). Once per phone number.
// The wording lives in SALE_UPDATE_TEMPLATES only. Change it there.
const { toUsSmsNumber } = require("../../utils/usPhone");
const { toorakFormByKey } = require("../../config/toorakForms");
const { firstNameOf, TOORAK_SALE_UPDATE_TEMPLATE_KEY } = require("./facebookIntroText");

const SALE_UPDATE_TEMPLATE_KEY = TOORAK_SALE_UPDATE_TEMPLATE_KEY;
const ADVISOR_LINK = "cal.com/vihara-ai-advisor";
const SALE_UPDATE_TEMPLATES = {
  property: `Hey {First_name}, it's Maya from Vihara. Quick update on {address}: the online sale has moved to Sunday, Nov 15. That gives you an extra week to look at the photos and register: {listing_url} Questions? Book a 15 min call, no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
  propertyNoLink: `Hey {First_name}, it's Maya from Vihara. Quick update on {address}: the online sale has moved to Sunday, Nov 15. That gives you an extra week to look at the photos. Questions? Book a 15 min call, no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
  financing: `Hey {First_name}, it's Maya from Vihara. Quick update: the online sale for the homes you asked about has moved to Sunday, Nov 15. That's an extra week to sort out financing. Book a 15 min advisor call, no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
  registered: `Hey {First_name}, it's Maya from Vihara. Heads up: the online sale for {address} has moved to Sunday, Nov 15. Your registration still counts, nothing to do. Want to talk it through? ${ADVISOR_LINK} Reply STOP to opt out.`,
};
// One update per phone number, whichever record it came from.
const saleUpdateKeyFor = (phoneE164) => `toorak-nov15-update-${phoneE164}`;

const fill = (template, values) => template.replace(/\{(First_name|address|listing_url)\}/g, (m, k) => values[k] ?? m);
const emailOf = (v) => String(v || "").trim().toLowerCase();

/**
 * The person's update text.
 * @param {object} person - { fullName, firstName, email, toorak? } (a Toorak lead, or a registrant)
 * @param {object} [opts] - { registeredForm }: the Toorak home (config entry) they registered on, if any
 * @returns {{ text, first, version, saleStartsAt } | { skip: reason }}
 */
function renderSaleUpdate(person, { registeredForm = null } = {}) {
  const first = firstNameOf(person);
  if (!first) return { skip: "no usable first name" };
  const { kind, key, listingUrl } = person.toorak || {};

  let version;
  let form = null;
  if (registeredForm?.address) {
    version = "registered";
    form = registeredForm;
  } else if (kind === "property") {
    form = toorakFormByKey(key);
    if (!form?.address) return { skip: "Toorak property form not in config/toorakForms.js (no address to name)" };
    version = listingUrl ? "property" : "propertyNoLink";
  } else if (kind === "financing") {
    version = "financing";
  } else {
    return { skip: "not a Toorak lead and not registered on a Toorak home" };
  }
  const text = fill(SALE_UPDATE_TEMPLATES[version], { First_name: first, address: form?.address || "", listing_url: listingUrl || "" });
  if (/[{}]/.test(text)) return { skip: "unresolved placeholder in text" };
  return { text, first, version, saleStartsAt: form?.saleStartsAt || "" };
}

/**
 * Everyone who could get the update: every Toorak lead (with the Toorak home they registered on, if any),
 * then every registrant on a Toorak home who isn't one of those leads (same email or phone). Pure.
 * @param {object[]} leads - Toorak FacebookFormLead docs, oldest first
 * @param {object[]} registrations - AuctionRegistration docs on the Toorak homes, oldest first
 * @param {Map<string, object>} formsByProductId - product id -> Toorak form config
 * @returns {object[]} [{ id, source: "toorak-lead"|"registration", phone, person, registeredForm }]
 */
function buildRecipients(leads, registrations, formsByProductId) {
  const regs = registrations
    .filter((r) => r.status !== "rejected" && formsByProductId.has(String(r.auctionId)))
    .map((r) => ({ r, form: formsByProductId.get(String(r.auctionId)), email: emailOf(r.email), phone: toUsSmsNumber(r.mobilePhone) }));

  const out = [];
  const leadEmails = new Set();
  const leadPhones = new Set();
  for (const lead of leads) {
    const phone = toUsSmsNumber(lead.phoneNormalized) || toUsSmsNumber(lead.phone);
    const email = emailOf(lead.email);
    if (email) leadEmails.add(email);
    if (phone) leadPhones.add(phone);
    const mine = regs.filter((g) => (email && g.email === email) || (phone && g.phone === phone));
    const registered = mine.find((g) => g.form.key === lead.toorak?.key) || mine[0];
    out.push({ id: `lead:${lead._id}`, source: "toorak-lead", phone, person: lead, registeredForm: registered?.form || null });
  }
  for (const g of regs) {
    if ((g.email && leadEmails.has(g.email)) || (g.phone && leadPhones.has(g.phone))) continue; // that lead already gets text 3
    const person = { fullName: [g.r.firstName, g.r.lastName].filter(Boolean).join(" "), email: g.r.email };
    out.push({ id: `registration:${g.r._id}`, source: "registration", phone: g.phone, person, registeredForm: g.form });
  }
  return out;
}

/**
 * Decide, per recipient, whether they get the update. Pure apart from the lookups it is handed.
 * @param {object[]} recipients - from buildRecipients
 * @param {object} lookups - { contactsByPhone: Map, sentByKey: Map(key -> message), phonesAlreadyUpdated: Set,
 *   optedInPhones: Set (numbers with text consent on file) }
 */
function planSaleUpdate(recipients, { contactsByPhone, sentByKey, phonesAlreadyUpdated, optedInPhones }) {
  const sendable = [];
  const skipped = [];
  const seenPhone = new Map();
  for (const rcp of recipients) {
    const { id, phone, person } = rcp;
    const skip = (reason) => skipped.push({ id, reason });

    if (!phone) { skip("no valid US phone number"); continue; }
    if (seenPhone.has(phone)) { skip(`same phone as ${seenPhone.get(phone)}`); continue; }
    seenPhone.set(phone, id);

    const prior = sentByKey.get(saleUpdateKeyFor(phone));
    if (prior) { skip(`already got the update (message ${prior._id}, status ${prior.status})`); continue; }
    if (phonesAlreadyUpdated.has(phone)) { skip("this number already got the update"); continue; }
    if (person.callingStopped) { skip("admin stopped contact (callingStopped)"); continue; }

    const contact = contactsByPhone.get(phone);
    if (contact?.optOut?.isOptedOut || contact?.consent?.status === "opted-out") { skip("contact opted out of texts"); continue; }
    if (contact?.phoneStatus === "invalid" || contact?.phoneStatus === "landline") { skip(`bad number (phone status "${contact.phoneStatus}")`); continue; }
    if (!optedInPhones.has(phone)) { skip("did not opt in to texts"); continue; }

    const r = renderSaleUpdate(person, { registeredForm: rcp.registeredForm });
    if (r.skip) { skip(r.skip); continue; }
    sendable.push({ ...rcp, ...r });
  }
  return { sendable, skipped };
}

module.exports = { SALE_UPDATE_TEMPLATE_KEY, SALE_UPDATE_TEMPLATES, saleUpdateKeyFor, renderSaleUpdate, buildRecipients, planSaleUpdate };
