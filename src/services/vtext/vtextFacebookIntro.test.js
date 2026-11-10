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

const NEW_TEXT = "Hi John - this is Maya from Vihara. Are you there? Reply STOP to opt out.";

test("renders the one first text every lead gets (no price answer needed)", () => {
  assert.equal(renderIntro(lead()).text, NEW_TEXT);
  assert.equal(renderIntro(lead({ answers: [] })).text, NEW_TEXT);
  assert.equal(renderIntro(lead({ fullName: "", firstName: "there", email: "a@b.com" })).skip, "no usable first name");
  assert.equal(script.TEMPLATE, "Hi {First_name} - this is Maya from Vihara. Are you there? Reply STOP to opt out.");
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
  assert.equal(calls[0].body, NEW_TEXT);
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
  await run(lead({ fullName: "", firstName: "there", email: "a@b.com" })); // no first name -> alert
  await run(lead(), { enqueueOutbound: async () => ({ message: { _id: "m" }, blocked: true, reason: "opted out" }) }); // blocked -> alert
  await run(lead(), { enqueueOutbound: async () => { throw new Error("redis down"); } }); // error -> alert
  assert.equal(alerts.length, 3);
  assert.deepEqual(alerts[0].fields.find((f) => f.label === "Why").value, "no usable first name");
  assert.match(alerts[0].fields.find((f) => f.label === "Phone").value, /0123$/); // full number: the alert is internal
  alerts.length = 0;
  await run(lead({ consent: false }));
  await run(lead({ callingStopped: true }));
  await maybeSendFacebookIntroText({ doc: lead(), isNew: false }, deps());
  await run(lead(), { enqueueOutbound: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); } });
  assert.equal(alerts.length, 0);
});

test("a failing Slack alert never breaks the send path", async () => {
  await maybeSendFacebookIntroText({ doc: lead({ fullName: "", firstName: "there", email: "a@b.com" }), isNew: true }, deps({ notify: async () => { throw new Error("slack down"); } }));
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
  await run({ fullName: "", firstName: "there", email: "a@b.com" });
  await run({ callingStopped: true });
  await run({ phoneNormalized: "", phone: "" });
  assert.equal(calls.length, 0);
});

// ── Toorak leads (config/toorakForms.js) ─────────────────────────────────────
const { TOORAK_TEMPLATE_KEY, INTRO_TEMPLATE_KEYS } = require("../leads/facebookIntroText");

const toorakLead = (toorak, over = {}) =>
  lead({ consent: true, consentSource: "admin-override", smsConsent: true, answers: [{ key: "timeline", question: "When?", value: "within_30_days", label: "Within 30 days" }], toorak, ...over });
const baltimore = { key: "ml-baltimore", kind: "property", known: true, propertySlug: "2529-2531-e-monument-st-baltimore", listingUrl: "https://vihara.ai/listing/2529-2531-e-monument-st-baltimore" };
const financing = { key: "financing-v2", kind: "financing", known: true, propertySlug: "", listingUrl: "https://vihara.ai/auctions" };

const BEFORE_SALE = new Date("2026-11-03T15:00:00Z");

test("Toorak leads get the same first text, under their own template key", () => {
  for (const t of [baltimore, financing, { ...baltimore, key: "ml-1983-law-st" }, { key: "unknown", kind: "property", known: false }]) {
    const r = renderIntro(toorakLead(t), BEFORE_SALE);
    assert.equal(r.text, NEW_TEXT);
    assert.equal(r.templateKey, TOORAK_TEMPLATE_KEY);
  }
  assert.equal(renderIntro(toorakLead(baltimore, { fullName: "", firstName: "there", email: "a@b.com" })).skip, "no usable first name");
});

// Noon Pacific on a weekday: inside the hours for the 415 test number.
const DAYTIME = () => new Date("2026-11-03T20:00:00Z");

test("Toorak follows the consent switch: ON needs the text box, OFF texts every new lead", async () => {
  const run = (doc, consentRequired) => maybeSendFacebookIntroText({ doc, isNew: true }, deps({ consentRequired: async () => consentRequired, now: DAYTIME }));
  await run(toorakLead(baltimore, { smsConsent: false }), true);                    // switch ON, no box -> skip
  await run(toorakLead(baltimore, { smsConsent: undefined, consentSource: "form-checkbox" }), true); // switch ON, call box only -> skip
  assert.equal(calls.length, 0);
  assert.equal(alerts.length, 0); // no consent is expected, not a Slack alert
  await run(toorakLead(baltimore), true);                                            // switch ON, sms box -> send
  await run(toorakLead(financing, { _id: "lead2", smsConsent: false }), false);      // switch OFF, no box (v2 forms) -> send
  assert.equal(calls.length, 2);
  assert.equal(calls[0].origin.templateKey, TOORAK_TEMPLATE_KEY);
  assert.equal(calls[0].idempotencyKey, "fb-intro-text-lead1");
  assert.equal(calls[0].scheduledFor, undefined); // daytime: goes now
  assert.equal(calls[0].body, NEW_TEXT);
  assert.equal(calls[1].body, NEW_TEXT);
});

test("other Facebook leads still follow the switch", async () => {
  await maybeSendFacebookIntroText({ doc: lead({ consent: false, consentSource: "" }), isNew: true }, deps({ consentRequired: async () => false }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scheduledFor, undefined);
});

test("a Toorak lead at night is held until 9 AM in its time zone", async () => {
  // 11 PM Pacific on Nov 14 -> 9 AM Pacific on Nov 15 (17:00Z), which is after Baltimore's sale started (16:00Z).
  await maybeSendFacebookIntroText({ doc: toorakLead(baltimore), isNew: true }, deps({ now: () => new Date("2026-11-15T07:00:00Z") }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scheduledFor.toISOString(), "2026-11-15T17:00:00.000Z");
  assert.equal(calls[0].body, NEW_TEXT);
});

test("the sms_consent box counts as text consent on any form; other leads keep the old template key", async () => {
  await maybeSendFacebookIntroText({ doc: lead({ consent: false, consentSource: "", smsConsent: true }), isNew: true }, deps());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin.templateKey, TEMPLATE_KEY);
  assert.deepEqual(INTRO_TEMPLATE_KEYS, [TEMPLATE_KEY, TOORAK_TEMPLATE_KEY, "toorak-nov15-update"]);
});

test("Toorak skip rules still apply: repeat, stopped, opted out", async () => {
  const run = (doc, isNew = true, over = {}) => maybeSendFacebookIntroText({ doc, isNew }, deps({ consentRequired: async () => false, now: DAYTIME, ...over }));
  await run(toorakLead(baltimore), false);
  await run(toorakLead(baltimore, { callingStopped: true }));
  await run(toorakLead(baltimore), true, { lookupsFor: async () => ({ ...empty(), contactsByPhone: new Map([["+14155550123", { optOut: { isOptedOut: true } }]]) }) });
  await run(toorakLead(baltimore), true, { lookupsFor: async () => ({ ...empty(), phonesAlreadyTexted: new Set(["+14155550123"]) }) });
  assert.equal(calls.length, 0);
});
