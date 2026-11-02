const test = require("node:test");
const assert = require("node:assert/strict");
const { fundingOf } = require("./leadFunding");
const { emailStatsFrom } = require("../integrations/emailEventsService");

test("buy-box funnels: every financing option lands in one bucket", () => {
  assert.equal(fundingOf({ buyBox: { financing: "cash" } }), "cash");
  for (const f of ["hard_money", "mortgage", "financing"]) assert.equal(fundingOf({ buyBox: { financing: f } }), "financing");
  assert.equal(fundingOf({ buyBox: { financing: "not_sure" } }), "not_sure");
});

test("needsFinancing: no means cash", () => {
  assert.equal(fundingOf({ needsFinancing: "no" }), "cash");
  assert.equal(fundingOf({ needsFinancing: "yes" }), "financing");
  assert.equal(fundingOf({ needsFinancing: "not_sure" }), "not_sure");
});

test("Facebook answers are read when the buy box is empty", () => {
  assert.equal(fundingOf({ buyBox: { financing: "" }, answers: [{ key: "how_pay", value: "cash", label: "" }] }), "cash");
  assert.equal(fundingOf({ answers: [{ key: "how_pay", value: "", label: "Financing" }] }), "financing");
  assert.equal(fundingOf({ answers: [{ key: "down_payment", value: "paying_cash", label: "" }] }), "cash");
});

test("buyerType: Home Popup values and labels, and Cash investor", () => {
  assert.equal(fundingOf({ buyerType: "cash" }), "cash");
  assert.equal(fundingOf({ buyerType: "Cash buyer" }), "cash");
  assert.equal(fundingOf({ buyerType: "Cash investor" }), "cash");
  assert.equal(fundingOf({ buyerType: "financing" }), "financing");
  assert.equal(fundingOf({ buyerType: "Not sure yet" }), "not_sure");
});

test("an explicit answer beats a buyer type, and no answer stays unknown", () => {
  assert.equal(fundingOf({ buyerType: "Cash investor", needsFinancing: "yes" }), "financing");
  assert.equal(fundingOf({ buyerType: "Flipper" }), "unknown");
  assert.equal(fundingOf({}), "unknown");
});

test("email stats count one email once, however many events it fired", () => {
  const stats = emailStatsFrom([
    { messageId: "a", event: "delivered" },
    { messageId: "a", event: "opened" },
    { messageId: "a", event: "unique_opened" },
    { messageId: "a", event: "click" },
    { messageId: "b", event: "delivered" },
  ]);
  assert.deepEqual(stats, { delivered: 2, opened: 1, clicked: 1, failed: 0, bounced: false });
});

test("email stats: a bounce is flagged, soft or hard", () => {
  assert.equal(emailStatsFrom([{ messageId: "a", event: "soft_bounce" }]).bounced, true);
  assert.deepEqual(emailStatsFrom([{ messageId: "a", event: "hard_bounce" }]), { delivered: 0, opened: 0, clicked: 0, failed: 1, bounced: true });
});

test("email stats: campaign events with no message id still count", () => {
  const stats = emailStatsFrom([
    { messageId: "", subject: "Deals", event: "delivered" },
    { messageId: "", subject: "Deals", event: "opened" },
  ]);
  assert.deepEqual(stats, { delivered: 1, opened: 1, clicked: 0, failed: 0, bounced: false });
});
