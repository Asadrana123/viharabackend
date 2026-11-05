// services/leads/toorakSaleUpdateText.js
//
// The one-off "the sale moved to Sunday, Nov 15" text to every Toorak lead (Prajwal, 5 Nov 2026), sent by
// hand with scripts/textToorakSaleUpdate.js. Three versions, Prajwal's exact wording:
//   property   a property form's lead: their home, its page link, the advisor call
//   financing  a financing form's lead: the advisor call
//   registered anyone already registered on one of the Toorak homes: their registration still counts
// When a property lead has no page link, the link and the words "and register" go (Prajwal's rule).
// The wording lives in SALE_UPDATE_TEMPLATES only. Change it there.
const { toUsSmsNumber } = require("../../utils/usPhone");
const { toorakFormByKey } = require("../../config/toorakForms");
const { firstNameOf } = require("./facebookIntroText");

const SALE_UPDATE_TEMPLATE_KEY = "toorak-nov15-update";
const ADVISOR_LINK = "cal.com/vihara-ai-advisor";
const SALE_UPDATE_TEMPLATES = {
  property: `Hey {First_name}, it's Maya from Vihara. Quick update on {address}: the online sale has moved to Sunday, Nov 15. That gives you an extra week to look at the photos and register: {listing_url} Questions? Book a 15 min call, no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
  propertyNoLink: `Hey {First_name}, it's Maya from Vihara. Quick update on {address}: the online sale has moved to Sunday, Nov 15. That gives you an extra week to look at the photos. Questions? Book a 15 min call, no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
  financing: `Hey {First_name}, it's Maya from Vihara. Quick update: the online sale for the homes you asked about has moved to Sunday, Nov 15. That's an extra week to sort out financing. Book a 15 min advisor call, no cost: ${ADVISOR_LINK} Reply STOP to opt out.`,
  registered: `Hey {First_name}, it's Maya from Vihara. Heads up: the online sale for {address} has moved to Sunday, Nov 15. Your registration still counts, nothing to do. Want to talk it through? ${ADVISOR_LINK} Reply STOP to opt out.`,
};
const saleUpdateKeyFor = (leadId) => `toorak-nov15-update-${leadId}`;

const fill = (template, values) => template.replace(/\{(First_name|address|listing_url)\}/g, (m, k) => values[k] ?? m);

/**
 * The lead's update text. registeredForm: the Toorak home (config entry) they registered on, if any.
 * @returns {{ text, first, version, saleStartsAt } | { skip: reason }}
 */
function renderSaleUpdate(lead, { registeredForm = null } = {}) {
  const first = firstNameOf(lead);
  if (!first) return { skip: "no usable first name" };
  const { kind, key, listingUrl } = lead.toorak || {};

  let version;
  let form = null;
  if (registeredForm?.address) {
    version = "registered";
    form = registeredForm;
  } else if (kind === "property") {
    form = toorakFormByKey(key);
    if (!form?.address) return { skip: "Toorak property form not in config/toorakForms.js (no address to name)" };
    version = listingUrl ? "property" : "propertyNoLink";
  } else {
    version = "financing";
  }
  const text = fill(SALE_UPDATE_TEMPLATES[version], { First_name: first, address: form?.address || "", listing_url: listingUrl || "" });
  if (/[{}]/.test(text)) return { skip: "unresolved placeholder in text" };
  return { text, first, version, saleStartsAt: form?.saleStartsAt || "" };
}

/**
 * Decide, per lead, whether it gets the update text. Pure apart from the lookups it is handed.
 * @param {object[]} leads - Toorak FacebookFormLead docs, oldest first
 * @param {object} lookups - { contactsByPhone: Map, sentByKey: Map(key -> message), phonesAlreadyUpdated: Set,
 *   registeredFormFor: (lead, phone) => toorak form config or null }
 */
function planSaleUpdate(leads, { contactsByPhone, sentByKey, phonesAlreadyUpdated, registeredFormFor = () => null }) {
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

    const prior = sentByKey.get(saleUpdateKeyFor(id));
    if (prior) { skip(`already got the update (message ${prior._id}, status ${prior.status})`); continue; }
    if (phonesAlreadyUpdated.has(phone)) { skip("this number already got the update (another lead record)"); continue; }
    if (lead.callingStopped) { skip("admin stopped contact (callingStopped)"); continue; }

    const contact = contactsByPhone.get(phone);
    if (contact?.optOut?.isOptedOut || contact?.consent?.status === "opted-out") { skip("contact opted out of texts"); continue; }
    if (contact?.phoneStatus === "invalid" || contact?.phoneStatus === "landline") { skip(`bad number (phone status "${contact.phoneStatus}")`); continue; }

    const r = renderSaleUpdate(lead, { registeredForm: registeredFormFor(lead, phone) });
    if (r.skip) { skip(r.skip); continue; }
    sendable.push({ lead, id, phone, ...r });
  }
  return { sendable, skipped };
}

module.exports = { SALE_UPDATE_TEMPLATE_KEY, SALE_UPDATE_TEMPLATES, saleUpdateKeyFor, renderSaleUpdate, planSaleUpdate };
