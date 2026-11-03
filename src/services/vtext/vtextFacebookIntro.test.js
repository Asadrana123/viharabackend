const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { maybeSendFacebookIntroText } = require("./vtextFacebookIntroService");
const { renderIntro, planLeads, keyFor, TEMPLATE_KEY } = require("../leads/facebookIntroText");
const script = require("../../scripts/textFacebookFormLeads");

const lead = (over = {}) => ({
  _id: "lead1", fullName: "JOHN smith", firstName: "John", email: "j@x.com",
  phoneNormalized: "+14155550123", consent: true, consentSource: "form-disclaimer",
  answers: [{ key: "price_range", question: "Price?", value: "p1", label: "$300K" }],
  ...over,
});
const empty = () => ({ contactsByPhone: new Map(), sentByKey: new Map(), phonesAlreadyTexted: new Set() });

let calls, alerts;
const deps = (over = {}) => ({
  enqueueOutbound: async (a) => { calls.push(a); return { message: { _id: "m1" } }; },
  lookupsFor: async () => empty(),
  notify: async (a) => { alerts.push(a); },
  consentRequired: async () => true,
  ...over,
});
beforeEach(() => {
  calls = []; alerts = [];
  process.env.VTEXT_ENABLED = "true";
  process.env.FACEBOOK_AUTO_TEXT_ENABLED = "true";
  console.log = () => {}; console.error = () => {};
});

test("renders the shared wording", () => {
  assert.equal(renderIntro(lead()).text, "Hi John, this is Maya from Vihara. Got it: homes up to $300K. I’ll text you bank-owned deals that fit first. Reply STOP to opt out.");
  assert.equal(renderIntro(lead({ fullName: "", firstName: "there", email: "a@b.com" })).skip, "no usable first name");
  assert.equal(renderIntro(lead({ answers: [] })).skip, "no price-range answer");
});

test('an "Under $150K" label reads "homes under $150K", not "homes up to Under $150K"', () => {
  const under = (label) => lead({ answers: [{ key: "price_range", question: "Price?", value: "p0", label }] });
  assert.equal(renderIntro(under("Under $150K")).text, "Hi John, this is Maya from Vihara. Got it: homes under $150K. I’ll text you bank-owned deals that fit first. Reply STOP to opt out.");
  assert.equal(renderIntro(under("under $200K")).text.includes("homes under $200K."), true);
  assert.equal(renderIntro(under("$150K–$300K")).text.includes("homes up to $150K–$300K."), true); // other labels unchanged
  assert.equal(script.upToReadsWrong("Under $150K"), false);
  assert.equal(script.upToReadsWrong("$500K+"), true);
});

test("the script still exports the shared helpers", () => {
  for (const k of ["run", "renderIntro", "firstNameOf", "planLeads", "capitalise", "keyFor", "TEMPLATE"]) assert.ok(script[k], k);
});

test("planLeads skip rules", () => {
  const plan = (l, lookups = empty()) => planLeads([l], lookups).skipped[0]?.reason;
  assert.match(plan(lead({ phoneNormalized: "", phone: "" })), /no valid US phone/);
  assert.match(plan(lead({ callingStopped: true })), /callingStopped/);
  assert.match(plan(lead(), { ...empty(), sentByKey: new Map([[keyFor("lead1"), { _id: "m", status: "sent" }]]) }), /already handled/);
  assert.match(plan(lead(), { ...empty(), phonesAlreadyTexted: new Set(["+14155550123"]) }), /already got the intro/);
  assert.match(plan(lead(), { ...empty(), contactsByPhone: new Map([["+14155550123", { optOut: { isOptedOut: true } }]]) }), /opted out/);
  assert.match(plan(lead(), { ...empty(), contactsByPhone: new Map([["+14155550123", { phoneStatus: "landline" }]]) }), /bad number/);
});

test("queues one text for a new consented lead", async () => {
  await maybeSendFacebookIntroText({ doc: lead(), isNew: true }, deps());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "+14155550123");
  assert.equal(calls[0].idempotencyKey, "fb-intro-text-lead1");
  assert.match(calls[0].body, /^Hi John, this is Maya/);
  assert.deepEqual(calls[0].origin, { kind: "automation", templateKey: TEMPLATE_KEY, leadRef: { leadType: "facebookForm", leadId: "lead1" } });
});

test("sends nothing when it should not", async () => {
  const run = (doc, isNew = true) => maybeSendFacebookIntroText({ doc, isNew }, deps());
  await run(lead({ consent: false }));
  await run(lead({ consentSource: "" }));
  await run(lead(), false);
  await run(lead({ importedFromHistory: true }));
  await run(lead({ callingStopped: true }));
  process.env.FACEBOOK_AUTO_TEXT_ENABLED = "false";
  await run(lead());
  process.env.FACEBOOK_AUTO_TEXT_ENABLED = "true";
  process.env.VTEXT_ENABLED = "false";
  await run(lead());
  assert.equal(calls.length, 0);
});

test("never throws: blocked, duplicate key, other errors", async () => {
  await maybeSendFacebookIntroText({ doc: lead(), isNew: true }, deps({ enqueueOutbound: async () => ({ message: { _id: "m" }, blocked: true, reason: "no consent" }) }));
  await maybeSendFacebookIntroText({ doc: lead(), isNew: true }, deps({ enqueueOutbound: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); } }));
  await maybeSendFacebookIntroText({ doc: lead(), isNew: true }, deps({ enqueueOutbound: async () => { throw new Error("redis down"); } }));
});

test("Slack alert only for leads somebody should look at", async () => {
  const run = (doc, over) => maybeSendFacebookIntroText({ doc, isNew: true }, deps(over));
  await run(lead({ answers: [] }));                                  // no price answer -> alert
  await run(lead({ fullName: "", firstName: "there", email: "a@b.com" })); // no first name -> alert
  await run(lead(), { enqueueOutbound: async () => ({ message: { _id: "m" }, blocked: true, reason: "opted out" }) }); // blocked -> alert
  await run(lead(), { enqueueOutbound: async () => { throw new Error("redis down"); } }); // error -> alert
  assert.equal(alerts.length, 4);
  assert.deepEqual(alerts[0].fields.find((f) => f.label === "Why").value, "no price-range answer");
  assert.equal(alerts[0].fields.find((f) => f.label === "Phone").value, "…0123");
  alerts.length = 0;
  await run(lead({ consent: false }));
  await run(lead({ callingStopped: true }));
  await maybeSendFacebookIntroText({ doc: lead(), isNew: false }, deps());
  await run(lead(), { enqueueOutbound: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); } });
  assert.equal(alerts.length, 0);
});

test("a failing Slack alert never breaks the send path", async () => {
  await maybeSendFacebookIntroText({ doc: lead({ answers: [] }), isNew: true }, deps({ notify: async () => { throw new Error("slack down"); } }));
});

test("the consent switch decides: ON needs the form's consent, OFF texts every new lead", async () => {
  const override = lead({ consent: true, consentSource: "admin-override" });
  const noConsent = lead({ consent: false, consentSource: "" });
  const run = (doc, consentRequired) => maybeSendFacebookIntroText({ doc, isNew: true }, deps({ consentRequired: async () => consentRequired }));
  await run(override, true);   // switch ON: the form gave no consent (admin override only covers calls) -> skip
  await run(noConsent, true);  // switch ON -> skip
  assert.equal(calls.length, 0);
  await run(lead(), true);     // switch ON, form-disclaimer consent -> send
  await run(override, false);  // switch OFF -> send
  await run(noConsent, false); // switch OFF -> send
  assert.equal(calls.length, 3);
});

test("with the switch OFF the other skip rules still apply", async () => {
  const run = (over) => maybeSendFacebookIntroText({ doc: lead({ consent: false, consentSource: "", ...over }), isNew: true }, deps({ consentRequired: async () => false }));
  await run({ answers: [] });
  await run({ callingStopped: true });
  await run({ phoneNormalized: "", phone: "" });
  assert.equal(calls.length, 0);
});

// ── Toorak leads (config/toorakForms.js) ─────────────────────────────────────
const { TOORAK_TEMPLATE_KEY, INTRO_TEMPLATE_KEYS } = require("../leads/facebookIntroText");

const toorakLead = (toorak, over = {}) =>
  lead({ consent: true, consentSource: "admin-override", answers: [{ key: "timeline", question: "When?", value: "within_30_days", label: "Within 30 days" }], toorak, ...over });
const baltimore = { key: "ml-baltimore", kind: "property", known: true, propertySlug: "2529-2531-e-monument-st-baltimore", listingUrl: "https://vihara.ai/listing/2529-2531-e-monument-st-baltimore" };
const financing = { key: "financing-v2", kind: "financing", known: true, propertySlug: "", listingUrl: "https://vihara.ai/auctions" };

const BEFORE_SALE = new Date("2026-11-03T15:00:00Z");

test("Toorak property lead: names the home and the sale day, no link, no price answer needed", () => {
  const r = renderIntro(toorakLead(baltimore), BEFORE_SALE);
  assert.equal(r.text, "Hey John, it's Maya, Vihara's AI assistant. You asked about 2529-2531 E Monument St, Baltimore on Facebook. Still interested? It sells online this Saturday, Nov 7. Reply STOP to opt out.");
  assert.equal(r.templateKey, TOORAK_TEMPLATE_KEY);
});

test("Toorak property lead: the sale sentence goes once that home's sale starts (11 AM local)", () => {
  const nola = { ...baltimore, key: "ml-1983-law-st" };
  // 11:30 AM Eastern = 10:30 AM Central: Baltimore's sale has started, New Orleans' hasn't.
  const at = new Date("2026-11-07T16:30:00Z");
  assert.equal(renderIntro(toorakLead(baltimore), at).text, "Hey John, it's Maya, Vihara's AI assistant. You asked about 2529-2531 E Monument St, Baltimore on Facebook. Still interested? Reply STOP to opt out.");
  assert.match(renderIntro(toorakLead(nola), at).text, /1983 Law St, New Orleans on Facebook\. Still interested\? It sells online this Saturday, Nov 7\./);
  assert.doesNotMatch(renderIntro(toorakLead(nola), new Date("2026-11-07T17:00:00Z")).text, /Saturday/);
});

test("Toorak financing lead: asks the area and offers the advisor call", () => {
  const r = renderIntro(toorakLead(financing), BEFORE_SALE);
  assert.equal(r.text, "Hey John, it's Maya, Vihara's AI assistant. You asked about financing a home on Facebook. What area are you looking in? Or if you'd rather talk it through, a 15 min advisor call is no cost: cal.com/vihara-ai-advisor Reply STOP to opt out.");
  assert.equal(r.templateKey, TOORAK_TEMPLATE_KEY);
});

test("Toorak edge cases: unknown property form and no first name are skipped; no link is fine", () => {
  const unknown = renderIntro(toorakLead({ key: "unknown", kind: "property", known: false, listingUrl: "https://vihara.ai/auctions" }));
  assert.match(unknown.skip, /not in config\/toorakForms\.js/);
  assert.ok(renderIntro(toorakLead({ ...baltimore, listingUrl: "" }), BEFORE_SALE).text);
  assert.equal(renderIntro(toorakLead(baltimore, { fullName: "", firstName: "there", email: "a@b.com" })).skip, "no usable first name");
});

test("Toorak follows the consent switch like other Facebook leads", async () => {
  const run = (doc, consentRequired) => maybeSendFacebookIntroText({ doc, isNew: true }, deps({ consentRequired: async () => consentRequired }));
  await run(toorakLead(baltimore), true);                                          // switch ON, no box -> skip
  await run(toorakLead(baltimore, { consentSource: "form-checkbox" }), true);       // call box only -> skip
  assert.equal(calls.length, 0);
  await run(toorakLead(baltimore, { smsConsent: true }), true);                     // switch ON, sms box -> send
  await run(toorakLead(financing), false);                                          // switch OFF -> send
  assert.equal(calls.length, 2);
  assert.equal(calls[0].origin.templateKey, TOORAK_TEMPLATE_KEY);
  assert.equal(calls[0].idempotencyKey, "fb-intro-text-lead1");
  assert.match(calls[0].body, /2529-2531 E Monument St/);
  assert.match(calls[1].body, /financing/);
});

test("the sms_consent box counts as text consent on any form; other leads keep the old template key", async () => {
  await maybeSendFacebookIntroText({ doc: lead({ consent: false, consentSource: "", smsConsent: true }), isNew: true }, deps());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin.templateKey, TEMPLATE_KEY);
  assert.deepEqual(INTRO_TEMPLATE_KEYS, [TEMPLATE_KEY, TOORAK_TEMPLATE_KEY]);
});

test("Toorak skip rules still apply: repeat, stopped, opted out", async () => {
  const run = (doc, isNew = true, over = {}) => maybeSendFacebookIntroText({ doc, isNew }, deps({ consentRequired: async () => false, ...over }));
  await run(toorakLead(baltimore), false);
  await run(toorakLead(baltimore, { callingStopped: true }));
  await run(toorakLead(baltimore), true, { lookupsFor: async () => ({ ...empty(), contactsByPhone: new Map([["+14155550123", { optOut: { isOptedOut: true } }]]) }) });
  await run(toorakLead(baltimore), true, { lookupsFor: async () => ({ ...empty(), phonesAlreadyTexted: new Set(["+14155550123"]) }) });
  assert.equal(calls.length, 0);
});
