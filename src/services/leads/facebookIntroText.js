// services/leads/facebookIntroText.js
//
// The Facebook / Instagram form lead intro text: its wording and the rules for who gets it. Shared by
// scripts/textFacebookFormLeads.js (one-off, by hand) and services/vtext/vtextFacebookIntroService.js
// (automatic, on each new lead), so both agree on the text and on who is skipped.
// The wording lives in TEMPLATE only. Change it there.
const { splitName } = require("./buyBox");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { priceRangeOf } = require("./facebookPriceRange");

const TEMPLATE_KEY = "facebook-form-intro";
// The owner's exact wording, with the curly apostrophe.
const TEMPLATE = "Hi {First_name}, this is Maya from Vihara. Got it: homes up to {price_range}. I’ll text you bank-owned deals that fit first. Reply STOP to opt out.";
const keyFor = (leadId) => `fb-intro-text-${leadId}`;


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

module.exports = { TEMPLATE_KEY, TEMPLATE, keyFor, capitalise, firstNameOf, upToReadsWrong, renderIntro, planLeads };
