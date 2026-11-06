const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { renderFormText, formatAuctionDate, FORM_KEYS, templateKeyFor } = require("./formIntroTexts");
const { maybeSendFormIntroText, formTextEnabled } = require("./vtextFormIntroService");

// ── Wording (Prajwal, 6 Nov 2026) ────────────────────────────────────────────

test("every text starts as Maya and ends with the STOP line", () => {
  const values = { name: "Steve Rogers", property_short: "449 Georgia St", page_title: "Spring Auction", auction_date: "Sat, Nov 15" };
  for (const form of FORM_KEYS) {
    const { text } = renderFormText(form, values);
    assert.ok(text.startsWith("Hi Steve, it's Maya, Vihara's AI assistant. "), form);
    assert.ok(text.endsWith(" Reply STOP to opt out."), form);
  }
});

test("each form's exact text", () => {
  const v = { name: "Steve Rogers", property_short: "449 Georgia St", page_title: "Spring Auction", auction_date: "Sat, Nov 15" };
  const t = (form) => renderFormText(form, v).text;
  assert.equal(t("dealFinancing"), "Hi Steve, it's Maya, Vihara's AI assistant. Thanks for asking about financing 449 Georgia St. Want a free 15 min call with an advisor? cal.com/vihara-ai-advisor Reply STOP to opt out.");
  assert.equal(t("dealFinder"), "Hi Steve, it's Maya, Vihara's AI assistant. Thanks for using Deal Finder! I'll text you bank-owned homes that match. What area and budget are you aiming for? Reply STOP to opt out.");
  assert.equal(t("norcal"), "Hi Steve, it's Maya, Vihara's AI assistant. Thanks for joining NorCal early access. I'll text you bank-owned deals there first. Which city are you looking in? Reply STOP to opt out.");
  assert.equal(t("partner"), "Hi Steve, it's Maya, Vihara's AI assistant. Thanks for applying to the Vihara Partner Program. Want a quick 15 min call to walk through it? cal.com/vihara-ai-advisor Reply STOP to opt out.");
  const list = "Hi Steve, it's Maya, Vihara's AI assistant. You're on our list. I'll text you bank-owned homes as they drop. What area and price range? Reply STOP to opt out.";
  assert.equal(t("newDeals"), list);
  assert.equal(t("buyerList"), list);
  assert.equal(t("earlyAccess"), list);
  assert.equal(t("landingPage"), "Hi Steve, it's Maya, Vihara's AI assistant. Thanks for your interest in Spring Auction. Any questions I can answer? Reply STOP to opt out.");
  assert.equal(t("auctionRegistration"), "Hi Steve, it's Maya, Vihara's AI assistant. You're registered to bid on 449 Georgia St. Bidding is Sat, Nov 15. Questions? Just reply. Reply STOP to opt out.");
  assert.equal(t("sell"), "Hi Steve, it's Maya, Vihara's AI assistant. Thanks for reaching out about selling your property. When's a good time for a quick call? Reply STOP to opt out.");
});

test("no safe first name: just \"Hi,\" (never an email name)", () => {
  assert.ok(renderFormText("sell", { name: "steve@mail.com" }).text.startsWith("Hi, it's Maya"));
  assert.ok(renderFormText("sell", {}).text.startsWith("Hi, it's Maya"));
});

test("a text that needs a property, page or date is skipped without it", () => {
  assert.equal(renderFormText("dealFinancing", { name: "Steve" }).skip, "missing property_short");
  assert.equal(renderFormText("auctionRegistration", { name: "Steve", property_short: "1 Main St" }).skip, "missing auction_date");
  assert.equal(renderFormText("landingPage", { name: "Steve" }).skip, "missing page_title");
  assert.match(renderFormText("nope", {}).skip, /unknown form/);
});

test("auction date is read in the property's time zone", () => {
  const d = new Date("2026-11-15T03:00:00Z"); // 10 PM Nov 14 Eastern, 7 PM Nov 14 Pacific
  assert.equal(formatAuctionDate(d, "America/New_York"), "Sat, Nov 14");
  assert.equal(formatAuctionDate(new Date("2026-11-15T17:00:00Z"), "America/Chicago"), "Sun, Nov 15");
  assert.equal(formatAuctionDate(null), "");
});

// ── Sending rules ────────────────────────────────────────────────────────────

const ON = { VTEXT_ENABLED: "true", VTEXT_FORM_TEXTS: "all" };
const NOON_ET = new Date("2026-11-10T17:00:00Z");
const NIGHT_ET = new Date("2026-11-10T03:00:00Z"); // 10 PM Eastern
let calls, alerts;
const deps = (over = {}) => ({
  env: ON,
  now: () => NOON_ET,
  enqueueOutbound: async (a) => { calls.push(a); return { message: { _id: "m1" } }; },
  alreadyTexted: async () => null,
  notify: async (a) => { alerts.push(a); },
  ...over,
});
const lead = (over = {}) => ({ _id: "lead1", phoneNormalized: "+12125550123", smsConsent: true, ...over });
beforeEach(() => {
  calls = []; alerts = [];
  console.log = () => {}; console.error = () => {};
});

test("turned on per form, or with \"all\"; never without VTEXT_ENABLED", () => {
  assert.equal(formTextEnabled("partner", { VTEXT_ENABLED: "true", VTEXT_FORM_TEXTS: "norcal, partner" }), true);
  assert.equal(formTextEnabled("sell", { VTEXT_ENABLED: "true", VTEXT_FORM_TEXTS: "norcal, partner" }), false);
  assert.equal(formTextEnabled("sell", { VTEXT_ENABLED: "true", VTEXT_FORM_TEXTS: "all" }), true);
  assert.equal(formTextEnabled("sell", { VTEXT_ENABLED: "false", VTEXT_FORM_TEXTS: "all" }), false);
  assert.equal(formTextEnabled("sell", { VTEXT_ENABLED: "true" }), false);
});

test("queues the text with its key, lead link and no hold during the day", async () => {
  const r = await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead(), name: "Steve Rogers" }, deps());
  assert.equal(r.queued, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "+12125550123");
  assert.equal(calls[0].idempotencyKey, "form-intro:partner:lead1");
  assert.deepEqual(calls[0].origin, { kind: "automation", templateKey: templateKeyFor("partner"), leadRef: { leadType: "partner", leadId: "lead1" } });
  assert.equal(calls[0].isReplyToInbound, false);
  assert.equal(calls[0].scheduledFor, undefined);
});

test("at night it waits for 9 AM in the lead's time zone", async () => {
  await maybeSendFormIntroText({ form: "norcal", leadType: "norcal", lead: lead(), name: "Steve" }, deps({ now: () => NIGHT_ET }));
  assert.equal(calls[0].scheduledFor.toISOString(), "2026-11-10T14:00:00.000Z"); // 9 AM Eastern
});

test("nothing is sent without the SMS tick, even while the consent check is OFF", async () => {
  const r = await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead({ smsConsent: false }), name: "Steve" }, deps());
  assert.equal(r.queued, false);
  assert.equal(calls.length, 0);
  assert.equal(alerts.length, 0, "a missing tick is normal, no Slack alert");
});

test("not turned on: nothing sent, nothing alerted", async () => {
  const r = await maybeSendFormIntroText({ form: "sell", leadType: "sell", lead: lead(), name: "Steve" }, deps({ env: { VTEXT_ENABLED: "true", VTEXT_FORM_TEXTS: "partner" } }));
  assert.deepEqual(r, { queued: false, reason: "not turned on" });
  assert.equal(calls.length + alerts.length, 0);
});

test("reads every phone field the forms use", async () => {
  await maybeSendFormIntroText({ form: "auctionRegistration", leadType: "auctionRegistration", lead: { _id: "r1", smsConsent: true, mobilePhone: "(212) 555-0123" }, name: "Steve", values: { property_short: "1 Main St", auction_date: "Sat, Nov 15" } }, deps());
  await maybeSendFormIntroText({ form: "sell", leadType: "sell", lead: { _id: "s1", smsConsent: true, phoneNumber: "212-555-0124" }, name: "Steve" }, deps());
  assert.deepEqual(calls.map((c) => c.to), ["+12125550123", "+12125550124"]);
});

test("a non-US number is skipped quietly", async () => {
  const r = await maybeSendFormIntroText({ form: "sell", leadType: "sell", lead: lead({ phoneNormalized: "+447911123456" }), name: "Steve" }, deps());
  assert.equal(r.queued, false);
  assert.equal(alerts.length, 0);
});

test("skips a number that already got a text, without an alert", async () => {
  const r = await maybeSendFormIntroText({ form: "dealFinder", leadType: "property", lead: lead(), name: "Steve" }, deps({ alreadyTexted: async () => "this number got another automatic text in the last 24 hours" }));
  assert.equal(r.queued, false);
  assert.equal(calls.length + alerts.length, 0);
});

test("a missing value or a Vtext block alerts Slack", async () => {
  await maybeSendFormIntroText({ form: "dealFinancing", leadType: "property", lead: lead(), name: "Steve" }, deps());
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].fields.find((f) => f.label === "Why").value, /property_short/);
  await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead(), name: "Steve" }, deps({ enqueueOutbound: async () => ({ blocked: true, reason: "opted out" }) }));
  assert.equal(alerts.length, 2);
});

test("never throws", async () => {
  const r = await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead(), name: "Steve" }, deps({ enqueueOutbound: async () => { throw new Error("db down"); } }));
  assert.equal(r.queued, false);
  assert.match(r.reason, /db down/);
});
