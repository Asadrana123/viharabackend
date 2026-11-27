// config/dealSheet.js
//
// The /deal form's private deal sheet (Prajwal's handover, 20 Nov 2026: PROMPT-deal-sheet-and-form-v2.md).
// Every /deal sign-up gets a 2-page PDF at their price, emailed (E1, template 198), and a short text saying so.
// Buyers who tick the Maya box also get a 6-digit code in that text.
//
// Deals are matched on the START of the slug, so the city ending doesn't matter. The website has the same two
// lists in components/deal-form/dealSheet.ts; change both together.

const { getSiteUrl } = require("./siteUrls");

// Cash-only deals: no "How will you pay?" question; pay is always cash. A deal with cashOnly: true wins over this.
// El Paso only: West Hollywood (960 Larrabee St) is back on financing (Prajwal, 21 Nov 2026).
const CASH_ONLY_PREFIXES = ["8206-loma-vista-pl"];

// The bank's pre-approval link for home-loan buyers (template 293 PREAPPROVAL_URL). Not known yet: set it here or
// in DEAL_PREAPPROVAL_URL and the email starts linking it, no template change. Never name the lender to buyers.
const PREAPPROVAL_URL = process.env.DEAL_PREAPPROVAL_URL || "";

// Buyers never see an advisor's name or photo (Prajwal, 27 Nov 2026, deal form v3): the form, the result page, the PDF
// and Maya's script all say "a Vihara advisor" / "your Vihara advisor", with a "VA" initials avatar. advisorFor()
// stays so the sheet data keeps its shape; it always returns null. Internal call tasks can still name who calls.

// The "Deal strategy call" cal.com event (founders as hosts), and the public walkthrough event used after the
// book-by date (sale date − 2 days) and for later / just-looking buyers.
const STRATEGY_CALL_URL = process.env.DEAL_STRATEGY_CALL_URL || "https://cal.com/vihara-ai-advisor/deal-strategy-call";
const WALKTHROUGH_URL = process.env.DEAL_WALKTHROUGH_URL || "https://cal.com/vihara-ai-advisor/walkthrough";

// The phone code: 6 digits, 10 minutes, 5 tries. Sends: 3 per lead, 5 per number per day.
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_LEAD = 3;
const MAX_SENDS_PER_NUMBER_PER_DAY = 5;

// Deal form v3 (Prajwal, 27 Nov 2026): only buyers who tick the Maya box get a code, and Maya calls every one of them.
// Code entered → verified, Maya calls at once. "Skip" → Maya calls at once, flagged phone_unverified.
// Left the code screen without either → the same unverified call after this long, 9 AM–8 PM deal time.
const UNVERIFIED_CALL_AFTER_MS = 10 * 60 * 1000;
const UNVERIFIED_CALL_HOURS = { start: 9, end: 20 };
// Older sign-ups than this never get the unverified call (stops a backlog dialling after downtime).
const UNVERIFIED_CALL_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// The confirmation email waits this long for the PDF, then goes with the link only.
const PDF_WAIT_MS = 60 * 1000;

const TIMELINES = ["30d", "90d", "180d", "looking"];
const PURPOSES = ["live_in", "rental", "house_hack", "fix_flip"];

const startsWithAny = (slug, prefixes) => prefixes.some((p) => String(slug || "").startsWith(p));

/** Is this deal cash only? */
function isCashOnly(product) {
  if (!product) return false;
  if (product.cashOnly === true) return true;
  return startsWithAny(product.slug, CASH_ONLY_PREFIXES);
}

/** The deal's advisor as buyers see it: always none, so every buyer-facing place says "a Vihara advisor". */
function advisorFor() {
  return null;
}

const sheetUrl = (token, marker) => `${getSiteUrl()}/s/${token}${marker ? `?v=${marker}` : ""}`;
// The booking link. A ref alone is only 4 characters, so the link also carries the first 8 characters of the sheet
// token (k): only with it does /b/ fill in the buyer's name and email on the booking page.
const bookKey = (token) => String(token || "").slice(0, 8);
const bookUrl = (ref, token) => `${getSiteUrl()}/b/${encodeURIComponent(ref)}?k=${bookKey(token)}`;

module.exports = {
  CASH_ONLY_PREFIXES,
  PREAPPROVAL_URL,
  STRATEGY_CALL_URL,
  WALKTHROUGH_URL,
  CODE_TTL_MS,
  CODE_MAX_ATTEMPTS,
  MAX_SENDS_PER_LEAD,
  MAX_SENDS_PER_NUMBER_PER_DAY,
  UNVERIFIED_CALL_AFTER_MS,
  UNVERIFIED_CALL_HOURS,
  UNVERIFIED_CALL_MAX_AGE_MS,
  PDF_WAIT_MS,
  TIMELINES,
  PURPOSES,
  isCashOnly,
  advisorFor,
  sheetUrl,
  bookUrl,
  bookKey,
};
