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
