// services/vtext/formIntroTexts.js
//
// The first text each website form sends through Vtext, word for word from Prajwal (6 Nov 2026).
// Every text starts with "Maya, Vihara's AI assistant" and ends with "Reply STOP to opt out."
// The general and financing texts link cal.com/vihara-ai-advisor. Change wording only with Prajwal.
//
// Pure: no database, no sending. vtextFormIntroService.js decides whether to send and queues the text.
// The /deal cash path is not here: it keeps the "Quote your price" text (vtextAutoSignupService.js).
const { DateTime } = require("luxon");
const { firstNameOf } = require("../../utils/firstName");

const CAL_LINK = "cal.com/vihara-ai-advisor";

/**
 * One entry per form. `needs` lists the values the text can't go out without.
 * `label` is what Slack and the logs call the form. `perProperty`: the text names a property, so a
 * number can get it again for a different property (otherwise once per number, ever).
 */
const FORM_TEXTS = {
  dealFinancing: {
    label: "/deal financing",
    perProperty: true,
    needs: ["property_short"],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. Thanks for asking about financing ${v.property_short}. Want a free 15 min call with an advisor? ${CAL_LINK} Reply STOP to opt out.`,
  },
  dealFinder: {
    label: "Deal Finder",
    needs: [],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. Thanks for using Deal Finder! I'll text you bank-owned homes that match. What area and budget are you aiming for? Reply STOP to opt out.`,
  },
  norcal: {
    label: "NorCal early access",
    needs: [],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. Thanks for joining NorCal early access. I'll text you bank-owned deals there first. Which city are you looking in? Reply STOP to opt out.`,
  },
  partner: {
    label: "Partner Program",
    needs: [],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. Thanks for applying to the Vihara Partner Program. Want a quick 15 min call to walk through it? ${CAL_LINK} Reply STOP to opt out.`,
  },
  // New Deals, Buyer List and Early Access share one text.
  newDeals: { label: "New Deals", needs: [], text: (v) => onTheList(v) },
  buyerList: { label: "Buyer List", needs: [], text: (v) => onTheList(v) },
  earlyAccess: { label: "Early Access", needs: [], text: (v) => onTheList(v) },
  landingPage: {
    label: "/lp landing page",
    needs: ["page_title"],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. Thanks for your interest in ${v.page_title}. Any questions I can answer? Reply STOP to opt out.`,
  },
  auctionRegistration: {
    label: "Auction registration",
    perProperty: true,
    needs: ["property_short", "auction_date"],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. You're registered to bid on ${v.property_short}. Bidding is ${v.auction_date}. Questions? Just reply. Reply STOP to opt out.`,
  },
  sell: {
    label: "Sell your property",
    needs: [],
    text: (v) => `${hi(v)}, it's Maya, Vihara's AI assistant. Thanks for reaching out about selling your property. When's a good time for a quick call? Reply STOP to opt out.`,
  },
};

const FORM_KEYS = Object.keys(FORM_TEXTS);

function onTheList(v) {
  return `${hi(v)}, it's Maya, Vihara's AI assistant. You're on our list. I'll text you bank-owned homes as they drop. What area and price range? Reply STOP to opt out.`;
}

/** "Hi Steve", or just "Hi" when there is no safe first name (never "Hi there", never an email name). */
function hi(v) {
  return v.first_name ? `Hi ${v.first_name}` : "Hi";
}

/** "Sat, Nov 15", in the property's own time zone, so the date doesn't slip a day. */
function formatAuctionDate(date, timezone = "America/New_York") {
  if (!date) return "";
  const dt = DateTime.fromJSDate(new Date(date), { zone: timezone });
  return dt.isValid ? dt.toFormat("ccc, LLL d") : "";
}

/**
 * The text for one form, or why it can't be sent.
 * @param {string} form - a FORM_TEXTS key
 * @param {{ name?: string, property_short?: string, page_title?: string, auction_date?: string }} values
 * @returns {{ text?: string, skip?: string }}
 */
function renderFormText(form, values = {}) {
  const def = FORM_TEXTS[form];
  if (!def) return { skip: `unknown form "${form}"` };
  const v = { ...values, first_name: firstNameOf(values.name || "") };
  const missing = def.needs.filter((k) => !String(v[k] || "").trim());
  if (missing.length) return { skip: `missing ${missing.join(", ")}` };
  return { text: def.text(v) };
}

/** The template key stored on the message (origin.templateKey), e.g. "form-intro-partner". */
const templateKeyFor = (form) => `form-intro-${form}`;

module.exports = { FORM_TEXTS, FORM_KEYS, CAL_LINK, renderFormText, formatAuctionDate, templateKeyFor };
