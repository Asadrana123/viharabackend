// services/leads/facebookIntroText.js
//
// The Facebook / Instagram form lead intro text: its wording and the rules for who gets it. Shared by
// scripts/textFacebookFormLeads.js (one-off, by hand) and services/vtext/vtextFacebookIntroService.js
// (automatic, on each new lead), so both agree on the text and on who is skipped.
// The wording lives in TEMPLATE / TOORAK_TEMPLATES only. Change it there.
//
// Toorak leads (config/toorakForms.js) get their own wording (Prajwal's, 3 Nov 2026), since their
// property forms ask no price question: a property form's lead hears about that home, with the sale
// day until its sale starts (saleStartsAt); a financing form's lead gets the advisor call link. No
// listing link in the first text: asking a question gets a reply, which keeps the line in good standing.
const { splitName } = require("./buyBox");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { priceRangeOf } = require("./facebookPriceRange");
const { toorakFormByKey } = require("../../config/toorakForms");

const TEMPLATE_KEY = "facebook-form-intro";
// The owner's exact wording, with the curly apostrophe.
const TEMPLATE = "Hi {First_name}, this is Maya from Vihara. Got it: homes up to {price_range}. I’ll text you bank-owned deals that fit first. Reply STOP to opt out.";
const keyFor = (leadId) => `fb-intro-text-${leadId}`;

const TOORAK_TEMPLATE_KEY = "toorak-intro";
// Prajwal's wording (toorak-texts-now.md, 3 Nov 2026). No clock time: listing pages and older copy disagree.
const ADVISOR_LINK = "cal.com/vihara-ai-advisor";
const TOORAK_TEMPLATES = {
  property: "Hey {First_name}, it's Maya, Vihara's AI assistant. You asked about {address} on Facebook. Still interested? It sells online this Saturday, Nov 7. Reply STOP to opt out.",
  propertyAfterSale: "Hey {First_name}, it's Maya, Vihara's AI assistant. You asked about {address} on Facebook. Still interested? Reply STOP to opt out.",
  financing: `Hey {First_name}, it's Maya, Vihara's AI assistant. You asked about financing a home on Facebook. What area are you looking in? Or if you'd rather talk it through, a 15 min advisor call is no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
};
// Every intro template key: a number that got any of them doesn't get another.
const INTRO_TEMPLATE_KEYS = [TEMPLATE_KEY, TOORAK_TEMPLATE_KEY];


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

// "Under $150K" would read "homes up to Under $150K", so renderIntro says "homes under $150K" for it.
const UNDER_LABEL = /^under\s+\S/i;

/** True when "homes up to <label>" reads wrong (ranges, "Under X", "X+", "not sure"...). */
function upToReadsWrong(label) {
  if (UNDER_LABEL.test(label)) return false; // renderIntro turns "Under $150K" into "homes under $150K"
  return /[–—-]|\bto\b|under|below|less|up to|over|more|plus|\+|above|sure|any/i.test(label);
}

/**
 * A Toorak lead's text: the home by address (with the sale day until saleStartsAt), or the financing text.
 * A property form not in config/toorakForms.js is skipped (no address to name); the skip posts to Slack.
 */
function renderToorakIntro(lead, first, now = new Date()) {
  const { kind, key } = lead.toorak;
  let template = TOORAK_TEMPLATES.financing;
  let address = "";
  if (kind === "property") {
    const form = toorakFormByKey(key);
    if (!form?.address) return { skip: "Toorak property form not in config/toorakForms.js (no address to name)" };
    address = form.address;
    const saleStarted = form.saleStartsAt && now >= new Date(form.saleStartsAt);
    template = saleStarted ? TOORAK_TEMPLATES.propertyAfterSale : TOORAK_TEMPLATES.property;
  }
  const text = template.replace("{First_name}", () => first).replace("{address}", () => address);
  if (/[{}]/.test(text)) return { skip: "unresolved placeholder in text" };
  return { text, first, templateKey: TOORAK_TEMPLATE_KEY };
}

/** { text, first, templateKey } or { skip: reason } */
function renderIntro(lead, now = new Date()) {
  const first = firstNameOf(lead);
  if (!first) return { skip: "no usable first name" };
  if (lead.toorak) return renderToorakIntro(lead, first, now);
  const price = priceRangeOf(lead);
  if (!price) return { skip: "no price-range answer" };
  const under = UNDER_LABEL.test(price);
  const template = under ? TEMPLATE.replace("homes up to {price_range}", "homes {price_range}") : TEMPLATE;
  const shown = under ? price.replace(/^under/i, "under") : price;
  const text = template.replace("{First_name}", () => first).replace("{price_range}", () => shown);
  if (/[{}]/.test(text)) return { skip: "unresolved placeholder in text" };
  return { text, first, price, templateKey: TEMPLATE_KEY };
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

module.exports = { TEMPLATE_KEY, TEMPLATE, TOORAK_TEMPLATE_KEY, TOORAK_TEMPLATES, INTRO_TEMPLATE_KEYS, keyFor, capitalise, firstNameOf, upToReadsWrong, renderIntro, planLeads };
