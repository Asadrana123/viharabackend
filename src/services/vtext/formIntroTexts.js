// services/vtext/formIntroTexts.js
//
// The first text each website form sends through Vtext. Every form now sends the same text
// (firstLeadText.js, 10 Nov 2026): "Hi {first name} - this is Maya from Vihara. Are you there? Reply STOP to opt out."
// The per-form entries stay so Slack, the logs and the once-per-number check can still tell the forms apart.
//
// Pure: no database, no sending. vtextFormIntroService.js decides whether to send and queues the text.
// The /deal cash path is not here: vtextAutoSignupService.js sends the same text and starts its follow-ups.
const { DateTime } = require("luxon");
const { firstNameOf } = require("../../utils/firstName");
const { firstLeadText } = require("./firstLeadText");

const CAL_LINK = "cal.com/vihara-ai-advisor";

const text = (v) => firstLeadText(v.first_name);

/**
 * One entry per form. `needs` lists the values the text can't go out without (none now: the text only
 * uses the first name, and goes out as "Hi, this is Maya..." without one).
 * `label` is what Slack and the logs call the form. Each form's text goes to a number once, ever.
 */
const FORM_TEXTS = {
  dealFinancing: { label: "/deal financing", needs: [], text },
  dealFinder: { label: "Deal Finder", needs: [], text },
  norcal: { label: "NorCal early access", needs: [], text },
  partner: { label: "Partner Program", needs: [], text },
  newDeals: { label: "New Deals", needs: [], text },
  buyerList: { label: "Buyer List", needs: [], text },
  earlyAccess: { label: "Early Access", needs: [], text },
  landingPage: { label: "/lp landing page", needs: [], text },
  auctionRegistration: { label: "Auction registration", needs: [], text },
  sell: { label: "Sell your property", needs: [], text },
};

const FORM_KEYS = Object.keys(FORM_TEXTS);

/** "Sat, Nov 15", in the property's own time zone, so the date doesn't slip a day. */
function formatAuctionDate(date, timezone = "America/New_York") {
  if (!date) return "";
  const dt = DateTime.fromJSDate(new Date(date), { zone: timezone });
  return dt.isValid ? dt.toFormat("ccc, LLL d") : "";
}

/**
 * The text for one form, or why it can't be sent.
 * @param {string} form - a FORM_TEXTS key
 * @param {{ name?: string }} values
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
