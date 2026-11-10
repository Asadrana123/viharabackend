const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { renderFormText, formatAuctionDate, FORM_KEYS, templateKeyFor } = require("./formIntroTexts");
const { maybeSendFormIntroText, formTextEnabled } = require("./vtextFormIntroService");

// ── Wording (one first text for every lead, 10 Nov 2026) ─────────────────────

test("every form sends the same first text", () => {
  for (const form of FORM_KEYS) {
    assert.equal(renderFormText(form, { name: "Steve Rogers" }).text, "Hi Steve - this is Maya from Vihara. Are you there? Reply STOP to opt out.", form);
  }
});

test("no safe first name: \"Hi, this is Maya\" (never an email name)", () => {
  assert.equal(renderFormText("sell", { name: "steve@mail.com" }).text, "Hi, this is Maya from Vihara. Are you there? Reply STOP to opt out.");
  assert.equal(renderFormText("sell", {}).text, "Hi, this is Maya from Vihara. Are you there? Reply STOP to opt out.");
});

test("no property, page or date is needed any more; an unknown form is skipped", () => {
  assert.ok(renderFormText("dealFinancing", { name: "Steve" }).text);
  assert.ok(renderFormText("auctionRegistration", { name: "Steve" }).text);
  assert.ok(renderFormText("landingPage", { name: "Steve" }).text);
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
  consentRequired: async () => true,
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

test("consent check ON: nothing is sent without the SMS tick", async () => {
  const r = await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead({ smsConsent: false }), name: "Steve" }, deps());
  assert.equal(r.queued, false);
  assert.equal(calls.length, 0);
  assert.equal(alerts.length, 0, "a missing tick is normal, no Slack alert");
});

test("consent check OFF: sent with or without the SMS tick", async () => {
  const off = deps({ consentRequired: async () => false });
  await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead({ smsConsent: false }), name: "Steve" }, off);
  await maybeSendFormIntroText({ form: "norcal", leadType: "norcal", lead: lead({ _id: "lead2" }), name: "Steve" }, off);
  assert.equal(calls.length, 2);
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

test("a Vtext block alerts Slack", async () => {
  await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead(), name: "Steve" }, deps({ enqueueOutbound: async () => ({ blocked: true, reason: "opted out" }) }));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].fields.find((f) => f.label === "Why").value, /opted out/);
});

test("never throws", async () => {
  const r = await maybeSendFormIntroText({ form: "partner", leadType: "partner", lead: lead(), name: "Steve" }, deps({ enqueueOutbound: async () => { throw new Error("db down"); } }));
  assert.equal(r.queued, false);
  assert.match(r.reason, /db down/);
});
