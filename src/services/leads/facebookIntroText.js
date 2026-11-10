// services/leads/facebookIntroText.js
//
// The Facebook / Instagram form lead intro text: its wording and the rules for who gets it. Shared by
// scripts/textFacebookFormLeads.js (one-off, by hand) and services/vtext/vtextFacebookIntroService.js
// (automatic, on each new lead), so both agree on the text and on who is skipped.
// The wording is the one first text every lead gets (services/vtext/firstLeadText.js, 10 Nov 2026):
// "Hi {First_name} - this is Maya from Vihara. Are you there? Reply STOP to opt out."
// Toorak leads (config/toorakForms.js) get the same text but keep their own template key, so the
// Toorak checks and counts still tell them apart.
const { splitName } = require("./buyBox");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { firstLeadText } = require("../vtext/firstLeadText");

const TEMPLATE_KEY = "facebook-form-intro";
const TEMPLATE = firstLeadText("{First_name}");
const keyFor = (leadId) => `fb-intro-text-${leadId}`;

const TOORAK_TEMPLATE_KEY = "toorak-intro";
const TOORAK_TEMPLATES = { property: TEMPLATE, propertyAfterSale: TEMPLATE, financing: TEMPLATE };
// The one-off "sale moved to Nov 15" update (services/leads/toorakSaleUpdateText.js). Prajwal (5 Nov 2026):
// it counts as a first text, so a number that got it never gets the normal intro as well.
const TOORAK_SALE_UPDATE_TEMPLATE_KEY = "toorak-nov15-update";
// Every intro template key: a number that got any of them doesn't get another.
const INTRO_TEMPLATE_KEYS = [TEMPLATE_KEY, TOORAK_TEMPLATE_KEY, TOORAK_SALE_UPDATE_TEMPLATE_KEY];


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

/** { text, first, templateKey } or { skip: reason }. Same text for every lead; Toorak keeps its own key. */
function renderIntro(lead) {
  const first = firstNameOf(lead);
  if (!first) return { skip: "no usable first name" };
  const text = firstLeadText(first);
  return { text, first, templateKey: lead.toorak ? TOORAK_TEMPLATE_KEY : TEMPLATE_KEY };
}

/**
 * Decide, per lead, whether it gets the text. Pure apart from the lookups it is handed.
 * @param {object[]} leads - FacebookFormLead docs, oldest first
 * @param {object} lookups - { contactsByPhone: Map, sentByKey: Map(key -> message), sentToContact: Set(phone) }
 * @param {object} [opts] - { now }: when the text will go out (decides a Toorak text's sale sentence)
 * @returns {{ sendable: object[], skipped: object[] }}
 */
function planLeads(leads, { contactsByPhone, sentByKey, phonesAlreadyTexted }, { now = new Date() } = {}) {
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

    const r = renderIntro(lead, now);
    if (r.skip) { skip(r.skip); continue; }
    sendable.push({ lead, id, phone, ...r });
  }
  return { sendable, skipped };
}

module.exports = { TEMPLATE_KEY, TEMPLATE, TOORAK_TEMPLATE_KEY, TOORAK_TEMPLATES, TOORAK_SALE_UPDATE_TEMPLATE_KEY, INTRO_TEMPLATE_KEYS, keyFor, capitalise, firstNameOf, upToReadsWrong, renderIntro, planLeads };
