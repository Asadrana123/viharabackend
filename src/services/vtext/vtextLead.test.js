// Pure-logic tests for texting a lead from the Leads tab: consent from a lead, templates without a property,
// {{price_range}}, and Facebook texting hours. No database.
const test = require("node:test");
const assert = require("node:assert/strict");

const { leadConsent } = require("./vtextLeadLookupService");
const { templateNeedsProperty, resolveContactVariables, renderTemplate, checkRendered, REQUIRED_CONTACT_KEYS } = require("./vtextTemplateService");
const { textingWindow, leadTextingHours } = require("../../utils/textingWindow");
const { priceRangeOf } = require("../leads/facebookPriceRange");

test("leadConsent: the SMS checkbox counts for any lead type", () => {
  const at = new Date("2026-10-01");
  assert.deepEqual(leadConsent("property", { smsConsent: true, smsConsentAt: at, smsConsentText: "ok" }), { consented: true, at, text: "ok" });
  assert.equal(leadConsent("property", { smsConsent: false }).consented, false);
});

test("leadConsent: a Facebook form with a call/text disclaimer counts, other lead types' plain consent does not", () => {
  const at = new Date("2026-10-02");
  const fb = { consent: true, consentSource: "form-disclaimer", consentTimestamp: at, consentText: "I agree to calls and texts" };
  assert.deepEqual(leadConsent("facebookForm", fb), { consented: true, at, text: "I agree to calls and texts" });
  assert.equal(leadConsent("facebookForm", { consent: true, consentSource: "" }).consented, false);
  assert.equal(leadConsent("facebookForm", { consent: false, consentSource: "form-disclaimer" }).consented, false);
  assert.equal(leadConsent("newDeals", fb).consented, false);
  assert.equal(leadConsent("facebookForm", null).consented, false);
});

test("templateNeedsProperty: only property variables need a property", () => {
  assert.equal(templateNeedsProperty("Hi {{name}}, got your {{price_range}} budget."), false);
  assert.equal(templateNeedsProperty("Hi {{name}}, see {{property_short}} in {{city}}."), true);
  assert.equal(templateNeedsProperty("No variables at all."), false);
});

test("a generic template renders with no property", () => {
  const values = resolveContactVariables("jane doe", { priceRange: "$300K–$500K" });
  const body = "Hi {{name}}, this is Maya. Got it: {{price_range}}.";
  const out = renderTemplate(body, values);
  assert.equal(out, "Hi Jane, this is Maya. Got it: $300K–$500K.");
  assert.equal(checkRendered(body, out, values, REQUIRED_CONTACT_KEYS), null);
});

test("a property template with no property is refused (placeholder left in the text)", () => {
  const values = resolveContactVariables("Jane");
  const body = "Hi {{name}}, check out {{property_short}}.";
  const out = renderTemplate(body, values);
  assert.match(checkRendered(body, out, values, REQUIRED_CONTACT_KEYS), /unresolved placeholder/);
});

test("{{price_range}} with no price range is refused instead of sending blank", () => {
  const values = resolveContactVariables("Jane");
  const body = "Hi {{name}}, homes up to {{price_range}}.";
  const out = renderTemplate(body, values);
  assert.equal(checkRendered(body, out, values, REQUIRED_CONTACT_KEYS), "missing price_range");
});

test("textingWindow: 8 AM-9 PM in both Eastern and Pacific", () => {
  // 2026-10-26 is in daylight time: ET = UTC-4, PT = UTC-7.
  assert.equal(textingWindow(new Date("2026-10-26T15:00:00Z")).ok, true); // 11 AM ET / 8 AM PT
  assert.equal(textingWindow(new Date("2026-10-26T14:59:00Z")).ok, false); // 10:59 AM ET / 7:59 AM PT
  assert.equal(textingWindow(new Date("2026-10-27T00:59:00Z")).ok, true); // 8:59 PM ET / 5:59 PM PT
  assert.equal(textingWindow(new Date("2026-10-27T01:00:00Z")).ok, false); // 9 PM ET
});

test("leadTextingHours: 8 AM-9 PM in the lead's own time (by area code)", () => {
  // 2026-10-26 is daylight time: ET = UTC-4, PT = UTC-7.
  const noon = new Date("2026-10-26T17:00:00Z"); // 1 PM ET / 10 AM PT
  assert.deepEqual(leadTextingHours("+12125550123", noon), { open: true, localTime: "1:00 PM EDT" }); // New York
  assert.deepEqual(leadTextingHours("+14155550123", noon), { open: true, localTime: "10:00 AM PDT" }); // San Francisco
  const late = new Date("2026-10-27T05:30:00Z"); // 1:30 AM ET / 10:30 PM PT
  assert.equal(leadTextingHours("+14155550123", late).open, false);
  assert.equal(leadTextingHours("+12125550123", late).open, false);
  // 9 AM Eastern is fine for an Eastern lead (the old Eastern+Pacific check would have refused it).
  assert.equal(leadTextingHours("+12125550123", new Date("2026-10-26T13:00:00Z")).open, true);
  assert.equal(textingWindow(new Date("2026-10-26T13:00:00Z")).ok, false);
  // Unknown area code or non-US: falls back to the Eastern+Pacific check, with no local time.
  assert.deepEqual(leadTextingHours("+917019236106", noon), { open: true });
  assert.deepEqual(leadTextingHours("+917019236106", late), { open: false });
  assert.deepEqual(leadTextingHours("", noon), { open: true });
});

test("priceRangeOf: label first, raw value only when it is a $ figure", () => {
  assert.equal(priceRangeOf({ answers: [{ key: "price_range", label: "$300K–$500K", value: "a" }] }), "$300K–$500K");
  assert.equal(priceRangeOf({ answers: [{ key: "budget", label: "", value: "$250,000" }] }), "$250,000");
  assert.equal(priceRangeOf({ answers: [{ key: "budget", label: "", value: "opt_2" }] }), null);
  assert.equal(priceRangeOf({ answers: [{ key: "email", label: "x@y.com" }] }), null);
});
