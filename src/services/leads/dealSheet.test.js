// The /deal form's private deal sheet: the data and words it shares with the email, and the text's compliance rules.
const test = require("node:test");
const assert = require("node:assert");
const { buildSheetData, emailParams, hookLine } = require("../dealSheet/dealSheetData");
const { canSend } = require("../vtext/vtextComplianceService");
const { textBody } = require("../dealSheet/phoneCodeService");
const { isCashOnly, advisorFor, bookUrl } = require("../../config/dealSheet");
const { decideRichContent } = require("../vtext/vtextRichContentGate");

const weho = {
  slug: "960-larrabee-st-west-hollywood",
  street: "960 Larrabee St",
  city: "West Hollywood",
  state: "CA",
  zipCode: "90069",
  propertyType: "Condo, Townhouse, other single unit",
  assetType: "Reo Bank Owned",
  beds: 2,
  baths: 2,
  squareFootage: 889,
  startBid: 450000,
  investmentData: { valuation: { ViharaValue: 518866 }, rental: { estimatedMonthlyRent: 3717 } },
  auctionStartDate: "2026-12-06T19:00:00Z",
};
const lead = (o = {}) => ({
  fullName: "Ana Lopez",
  phoneNormalized: "+13105550122",
  ref: "VH-3QW7",
  createdAt: "2026-11-20T15:00:00Z",
  purpose: "live_in",
  needsFinancing: "no",
  quotePrice: 465000,
  timeline: "30d",
  dealSheet: { token: "abcdefghijklmnopqrstuvwx", marker: "m4rk3r" },
  ...o,
});

test("the West Hollywood sample: the opening line, book-by and sale time match the handover", () => {
  const sheet = buildSheetData(lead(), weho);
  assert.equal(hookLine(sheet), "At $465,000 you'd buy this home about $53,866 under its market value.");
  const p = emailParams(sheet, lead());
  assert.equal(p.BOOK_BY, "Friday, Dec 4");
  assert.equal(p.SALE_TIME_TZ, "Sunday, Dec 6, 11:00 AM PST (Pacific Time)");
  assert.match(p.BOOK_URL, /\/b\/VH-3QW7\?k=abcdefgh&utm_source=email/);
  assert.equal(sheet.deal.type, "condo");
  assert.equal(sheet.deal.saleType, "Bank-owned");
  assert.equal(sheet.buyer.phone, "(310) 555-0122");
  assert.equal(sheet.advisor.name, "Vin");
});

test("later and just-looking buyers get no booking link or book-by date", () => {
  for (const timeline of ["90d", "180d", "looking"]) {
    const l = lead({ timeline });
    const p = emailParams(buildSheetData(l, weho), l);
    assert.equal(p.BOOK_URL, undefined);
    assert.equal(p.BOOK_BY, undefined);
    assert.equal(p.TIMELINE, timeline);
  }
});

test("rental buyers lead with rent and yield", () => {
  const l = lead({ purpose: "rental", quotePrice: 118000 });
  const elPaso = { ...weho, slug: "8206-loma-vista-pl-el-paso", investmentData: { valuation: { ViharaValue: 139888 }, rental: { estimatedMonthlyRent: 2263 } } };
  assert.equal(hookLine(buildSheetData(l, elPaso)), "At $118,000 this home could rent for about $2,263 a month, a 23% gross yield.");
});

test("cash-only deals and advisors are matched on the start of the slug", () => {
  assert.equal(isCashOnly({ slug: "960-larrabee-st-west-hollywood" }), true);
  assert.equal(isCashOnly({ slug: "8206-loma-vista-pl-el-paso-tx" }), true);
  assert.equal(isCashOnly({ slug: "1983-law-st-new-orleans" }), false);
  assert.equal(isCashOnly({ slug: "1983-law-st-new-orleans", cashOnly: true }), true);
  assert.equal(advisorFor({ slug: "1983-law-st-new-orleans" }), null);
  assert.equal(bookUrl("VH-3QW7", "abcdefghijk"), "https://www.vihara.ai/b/VH-3QW7?k=abcdefgh");
});

test("the deal sheet text goes without the SMS box, but never to someone who opted out", () => {
  const origin = { kind: "automation", templateKey: "deal-sheet-code" };
  assert.equal(canSend({ consent: { status: "unknown" } }, { origin }, { requireConsent: true }).allowed, true);
  assert.equal(canSend({ optOut: { isOptedOut: true } }, { origin }, { requireConsent: true }).allowed, false);
  assert.equal(canSend({ phoneStatus: "landline" }, { origin }, { requireConsent: true }).allowed, false);
  // Any other automated text still needs consent.
  assert.equal(canSend({ consent: { status: "unknown" } }, { origin: { kind: "automation", templateKey: "property-signup-quote" } }, { requireConsent: true }).allowed, false);
});

test("the text carries the link, the code and STOP; the link rule still blocks other texts", () => {
  const body = textBody({ street: "960 Larrabee St", token: "tok", marker: "mk", code: "482913" });
  assert.equal(body, "Vihara: your deal sheet for 960 Larrabee St: www.vihara.ai/s/tok?v=mk. Code 482913 to open it on the page. Reply STOP to opt out.");
  assert.ok(decideRichContent({ body, replied: false }).blockReason, "links to non-repliers stay blocked by default");
});
