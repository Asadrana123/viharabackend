// Loan type and pre-approval from the website's /deal form (buyBox.js): what is saved, the advisor's line, the
// investor-lender flag and Maya's {{prospect_loan_type}}.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  loanTypeFrom,
  loanTypeOtherFrom,
  preApprovedFrom,
  needsBusinessPurposeLender,
  loanLine,
  loanTypeSpoken,
  loanTypeBrevo,
  advisorFlags,
  downPaymentFrom,
} = require("./buyBox");
const { buildPropertyLeadAttributes } = require("../integrations/brevoService");

const fixer = { financeability: "cash_bridge_only" };

test("a loan on a cash-only home is flagged, except a fix-and-flip loan", () => {
  assert.ok(advisorFlags({ needsFinancing: "yes", loanType: "residential", preApproved: false }, fixer).includes("loan_buyer_on_cash_only_home"));
  assert.ok(advisorFlags({ needsFinancing: "yes", loanType: "residential", preApproved: true }, fixer).includes("loan_buyer_on_cash_only_home"));
  assert.ok(advisorFlags({ needsFinancing: "yes", loanType: "dscr" }, fixer).includes("loan_buyer_on_cash_only_home"));
  assert.ok(!advisorFlags({ needsFinancing: "yes", loanType: "fix_flip" }, fixer).includes("loan_buyer_on_cash_only_home"));
  assert.ok(!advisorFlags({ needsFinancing: "no" }, fixer).includes("loan_buyer_on_cash_only_home"));
  for (const f of ["unknown", "owner_ready", "dscr_ready", undefined])
    assert.ok(!advisorFlags({ needsFinancing: "yes", loanType: "residential" }, { financeability: f }).includes("loan_buyer_on_cash_only_home"), String(f));
});

test("the flags list carries needs_business_purpose_lender for non-home loans", () => {
  assert.deepEqual(advisorFlags({ needsFinancing: "yes", loanType: "dscr" }, {}), ["needs_business_purpose_lender"]);
  assert.deepEqual(advisorFlags({ needsFinancing: "yes", loanType: "residential" }, {}), []);
});

test("Brevo gets LOAN_TYPE, PRE_APPROVED and BUYER_TIER hot only for financing buyers", () => {
  const attrs = (l) => buildPropertyLeadAttributes({ email: "a@b.test", fullName: "Ana", ...l });
  const approved = attrs({ needsFinancing: "yes", loanType: loanTypeBrevo({ loanType: "dscr" }), preApproved: true });
  assert.equal(approved.LOAN_TYPE, "rental loan (DSCR)");
  assert.equal(approved.PRE_APPROVED, true);
  assert.equal(approved.BUYER_TIER, "hot");
  const notYet = attrs({ needsFinancing: "yes", loanType: loanTypeBrevo({ loanType: "other", loanTypeOther: "VA loan" }), preApproved: false });
  assert.equal(notYet.LOAN_TYPE, "VA loan");
  assert.equal(notYet.PRE_APPROVED, false);
  assert.equal("BUYER_TIER" in notYet, false);
  const cash = attrs({ needsFinancing: "no", loanType: "", preApproved: null });
  for (const k of ["LOAN_TYPE", "PRE_APPROVED", "BUYER_TIER"]) assert.equal(k in cash, false, k);
});

test("loan type is kept only for financing buyers, and only known values", () => {
  for (const t of ["residential", "dscr", "fix_flip", "other"]) assert.equal(loanTypeFrom(t, "yes"), t);
  assert.equal(loanTypeFrom("dscr", "no"), "");
  assert.equal(loanTypeFrom("dscr", ""), "");
  assert.equal(loanTypeFrom("hard_money", "yes"), "");
  assert.equal(loanTypeFrom(undefined, "yes"), "");
});

test("their own words are kept only with other, trimmed to 120 characters", () => {
  assert.equal(loanTypeOtherFrom("  VA loan  ", "other", "yes"), "VA loan");
  assert.equal(loanTypeOtherFrom("x".repeat(200), "other", "yes").length, 120);
  assert.equal(loanTypeOtherFrom("VA loan", "dscr", "yes"), "");
  assert.equal(loanTypeOtherFrom("VA loan", "other", "no"), "");
  assert.equal(loanTypeOtherFrom(42, "other", "yes"), "");
});

test("pre-approved is true/false for financing buyers, null otherwise", () => {
  assert.equal(preApprovedFrom(true, "yes"), true);
  assert.equal(preApprovedFrom(false, "yes"), false);
  assert.equal(preApprovedFrom(true, "no"), null);
  assert.equal(preApprovedFrom("true", "yes"), null);
  assert.equal(preApprovedFrom(undefined, "yes"), null);
});

test("Under 10% is a valid down payment", () => {
  assert.equal(downPaymentFrom("Under 10%", "yes"), "Under 10%");
});

test("anything but a home loan needs a business-purpose lender", () => {
  assert.equal(needsBusinessPurposeLender({ loanType: "residential" }), false);
  for (const t of ["dscr", "fix_flip", "other"]) assert.equal(needsBusinessPurposeLender({ loanType: t }), true, t);
  assert.equal(needsBusinessPurposeLender({ loanType: "" }), false);
  assert.equal(needsBusinessPurposeLender({}), false);
});

test("the advisor's line says the loan, pre-approval and which lender", () => {
  assert.equal(loanLine({ loanType: "residential", preApproved: true }), "home loan, pre-approved → bank partner");
  assert.equal(loanLine({ loanType: "dscr", preApproved: false }), "rental loan (DSCR), not pre-approved yet → needs an investor lender");
  assert.equal(loanLine({ loanType: "fix_flip", preApproved: true }), "fix-and-flip loan, pre-approved → needs an investor lender");
  assert.match(loanLine({ loanType: "other", loanTypeOther: "VA loan", preApproved: false }), /^other: "VA loan", not pre-approved yet/);
  assert.equal(loanLine({ loanType: "" }), "");
});

test("Maya gets the loan spoken, or their own words for other", () => {
  assert.equal(loanTypeSpoken({ loanType: "dscr" }), "a rental loan, D S C R");
  assert.equal(loanTypeSpoken({ loanType: "other", loanTypeOther: "VA loan" }), "VA loan");
  assert.equal(loanTypeSpoken({ loanType: "" }), "");
});
