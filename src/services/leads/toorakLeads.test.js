const test = require("node:test");
const assert = require("node:assert/strict");
const { toorakFormFor, TOORAK_FORM_IDS } = require("../../config/toorakForms");
const { findDeal } = require("../../config/newDeals");
const { hotReasons, leadStatusOf, formReport, checkboxConsents, isToorakTestLead } = require("./toorakLeads");
const { toorakRouteFor, buyBoxFrom, hotLeadAlert } = require("./facebookFormLeadService");
const { asWebhookLead } = require("./toorakLeadPoller");
const { inCallWindow, nextAttemptAt, mayCall } = require("../calling/toorakCallScheduler");

const ans = (o) => Object.entries(o).map(([key, value]) => ({ key, value, label: "" }));

test("all 7 live forms route by ID, and each property form's deal exists", () => {
  assert.equal(TOORAK_FORM_IDS.length, 7);
  const fin = toorakFormFor("1103113942694711", "anything");
  assert.equal(fin.kind, "financing");
  assert.equal(fin.known, true);
  for (const id of TOORAK_FORM_IDS) {
    const r = toorakFormFor(id, "");
    if (r.kind === "property") {
      const deal = findDeal(r.dealId);
      assert.ok(deal, `${r.key} deal ${r.dealId}`);
      assert.equal(deal.slug, r.propertySlug);
      assert.equal(deal.state, r.state);
    }
  }
});

test("routing ignores the name for known IDs and catches new Toorak names", () => {
  assert.equal(toorakFormFor("1571119771728277", "renamed form").key, "ml-baltimore");
  const ml = toorakFormFor("999", "ML-Toorak-Detroit-30Oct2026-v3");
  assert.deepEqual([ml.key, ml.kind, ml.known], ["unknown", "property", false]);
  assert.equal(toorakFormFor("998", "Toorak Buyers – Financing v3").kind, "financing");
  assert.equal(toorakFormFor("997", "VIH_Investor_Access_Q4"), null);
});

test("listing links: property form → its listing, financing → /auctions", () => {
  assert.equal(toorakRouteFor({ formId: "1157473749943510" }).listingUrl, "https://www.vihara.ai/listing/1983-law-st-new-orleans");
  assert.equal(toorakRouteFor({ formId: "1103113942694711" }).listingUrl, "https://www.vihara.ai/auctions");
  assert.equal(toorakRouteFor({ formId: "1", formName: "Some other form" }), null);
});

test("hot rule from the handover", () => {
  assert.deepEqual(hotReasons(ans({ timeline: "within_30_days", how_pay: "financing", down_payment: "10_20" })), ["Buying within 30 days"]);
  assert.deepEqual(hotReasons(ans({ timeline: "3_6_months", how_pay: "cash", down_payment: "paying_cash" })), ["Paying cash", "20%+ down or cash"]);
  assert.equal(hotReasons(ans({ down_payment: "20_30" })).length, 1);
  assert.equal(hotReasons(ans({ down_payment: "30_plus" })).length, 1);
  assert.deepEqual(hotReasons(ans({ timeline: "1_3_months", how_pay: "financing", down_payment: "under_10" })), []);
  // Answers that come back as labels.
  assert.equal(hotReasons([{ key: "timeline", value: "k1", label: "Within 30 days" }]).length, 1);
});

test("status: set by hand wins, else from the calls", () => {
  assert.equal(leadStatusOf({}), "new");
  assert.equal(leadStatusOf({ callStatus: "connected" }), "contacted");
  assert.equal(leadStatusOf({ callStatus: "not-reached" }), "unreachable");
  assert.equal(leadStatusOf({ callStatus: "no-answer" }), "new");
  assert.equal(leadStatusOf({ callStatus: "connected", leadStatus: "qualified" }), "qualified");
  assert.equal(leadStatusOf({ callStatus: "connected", leadStatus: "" }), "contacted");
});

test("per-form report", () => {
  const rows = formReport([
    { formId: "a", hot: true, callStatus: "connected" },
    { formId: "a", leadStatus: "converted" },
    { formId: "b", callStatus: "not-reached" },
  ], (id) => `Form ${id}`);
  assert.equal(rows[0].formId, "a");
  assert.equal(rows[0].name, "Form a");
  assert.deepEqual([rows[0].total, rows[0].hot, rows[0].contacted, rows[0].converted], [2, 1, 1, 1]);
  assert.equal(rows[1].unreachable, 1);
});

test("consent only from the exact call_consent / sms_consent checkboxes", () => {
  assert.deepEqual(checkboxConsents([{ checkboxKey: "call_consent", isChecked: true }]), { call: true, sms: false });
  assert.deepEqual(checkboxConsents([{ checkboxKey: "sms_consent", isChecked: true }, { checkboxKey: "call_consent", isChecked: false }]), { call: false, sms: true });
  assert.deepEqual(checkboxConsents([{ checkboxKey: "I agree to receive calls", isChecked: true }]), { call: false, sms: false });
  assert.deepEqual(checkboxConsents(undefined), { call: false, sms: false });
});

test("Maya calls every Toorak lead with consent on record, unless stopped", () => {
  assert.equal(mayCall({ consent: true, consentSource: "form-checkbox" }), true);
  assert.equal(mayCall({ consent: true, consentSource: "admin-override" }), true);
  assert.equal(mayCall({ consent: false }), false);
  assert.equal(mayCall({ consent: true, consentSource: "form-checkbox", callingStopped: true }), false);
});

test("call window 8 AM–9 PM local, and the 3 attempts", () => {
  const ny = "America/New_York";
  // 10:00 New York → stays.
  const at10 = new Date("2026-10-28T14:00:00Z");
  assert.equal(inCallWindow(at10, ny).toISOString(), at10.toISOString());
  // 22:30 New York → 8:00 next morning (12:00 UTC, EDT).
  assert.equal(inCallWindow(new Date("2026-10-29T02:30:00Z"), ny).toISOString(), "2026-10-29T12:00:00.000Z");
  // 06:00 Chicago → 8:00 same day.
  assert.equal(inCallWindow(new Date("2026-10-28T11:00:00Z"), "America/Chicago").toISOString(), "2026-10-28T13:00:00.000Z");
  // Attempts: +5 min, +1 h, +24 h, then none.
  assert.equal(nextAttemptAt(1, at10, ny).toISOString(), "2026-10-28T14:05:00.000Z");
  assert.equal(nextAttemptAt(2, at10, ny).toISOString(), "2026-10-28T15:00:00.000Z");
  assert.equal(nextAttemptAt(3, at10, ny).toISOString(), "2026-10-29T14:00:00.000Z");
  assert.equal(nextAttemptAt(4, at10, ny), null);
  // A lead at 20:58 New York: T+5 min is 21:03 → next morning.
  assert.equal(nextAttemptAt(1, new Date("2026-10-29T00:58:00Z"), ny).toISOString(), "2026-10-29T12:00:00.000Z");
});

test("test leads: dummy data, or no ad id and not organic", () => {
  assert.equal(isToorakTestLead({ adId: "123" }, { full_name: "<test lead: dummy data for full_name>" }), true);
  assert.equal(isToorakTestLead({ adId: null }, { full_name: "Ana" }), true);
  assert.equal(isToorakTestLead({ adId: null, isOrganic: true }, { full_name: "Ana" }), false);
  assert.equal(isToorakTestLead({ adId: "123" }, { full_name: "Ana" }), false);
});

test("auto-disqualified only with a wrong number AND a bounced email", () => {
  assert.equal(leadStatusOf({ phoneInvalid: true }, { emailBounced: true }), "disqualified");
  assert.equal(leadStatusOf({ phoneInvalid: true }, { emailBounced: false }), "new");
  assert.equal(leadStatusOf({ phoneInvalid: false }, { emailBounced: true }), "new");
  assert.equal(leadStatusOf({ phoneInvalid: true, leadStatus: "qualified" }, { emailBounced: true }), "qualified");
});

test("hot alert has name, phone, property, answers and the admin link", () => {
  const text = hotLeadAlert({
    fullName: "Ana Diaz", phone: "+14105550123", email: "a@b.co", formName: "ML-Toorak-Baltimore-27Oct2026-v2",
    toorak: { propertySlug: "2529-2531-e-monument-st-baltimore", listingUrl: "https://www.vihara.ai/listing/2529-2531-e-monument-st-baltimore" },
    hotReasons: ["Paying cash"], answers: [{ key: "how_pay", question: "How will you pay?", value: "cash", label: "Cash" }],
  });
  for (const part of ["Ana Diaz", "+14105550123", "/listing/2529-2531-e-monument-st-baltimore", "How will you pay?: Cash", "/admin/toorakLeads", "Maya (3 tries)"]) {
    assert.ok(text.includes(part), part);
  }
});

test("Financing v2 answers map onto the buy box", () => {
  const box = buyBoxFrom([
    { key: "markets", value: "maryland", label: "" },
    { key: "buying_for", value: "fix_flip", label: "" },
    { key: "how_pay", value: "financing", label: "" },
    { key: "down_payment", value: "30_plus", label: "" },
    { key: "price_range", value: "150k_300k", label: "" },
  ]);
  assert.deepEqual(box.states, ["MD"]); // the option key "maryland" is the state's name
  assert.deepEqual(box.strategy, ["flip"]);
  assert.equal(box.financing, "financing");
  assert.equal(box.down_payment, "25_plus");
  assert.deepEqual([box.price_min, box.price_max], [150000, 300000]);
  assert.deepEqual(buyBoxFrom([{ key: "markets", value: "other", label: "" }]).states, []);
});

test("a polled lead looks like a webhook lead", () => {
  const l = asWebhookLead({ id: "z1", leadgenId: "m1", formId: "f", createdTime: "2026-10-28T10:00:00Z", fields: { email: "a@b.co" }, consents: [] });
  assert.equal(l.leadgenId, "m1");
  assert.equal(l.createdAt, "2026-10-28T10:00:00Z");
  assert.equal(l.receivedVia, "poll");
});
