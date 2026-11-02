// services/leads/leadFunding.js
//
// How a lead plans to pay, as one value across every funnel. Each form asks in
// its own way, so this is the single place that folds the answers together:
//
//   buyBox.financing   /buyer-list, /new-deals, Facebook forms
//   needsFinancing     property pages, Early Access, NorCal, Partner (yes | no | not_sure)
//   answers            Facebook forms saved before buyBox was filled in
//   buyerType          Home Popup ("cash"), and older auction pages ("Cash investor")
//
// Returns cash | financing | not_sure | unknown. unknown = the form never asked,
// or they left it blank; it is never counted as cash or financing.

const FUNDING = ["cash", "financing", "not_sure", "unknown"];

const FROM_BUY_BOX = { cash: "cash", hard_money: "financing", mortgage: "financing", financing: "financing", not_sure: "not_sure" };
const FROM_NEEDS_FINANCING = { no: "cash", yes: "financing", not_sure: "not_sure" };

function fromAnswers(answers) {
  const answer = (key) => {
    const a = (answers || []).find((x) => x.key === key);
    return a ? `${a.value || ""} ${a.label || ""}`.toLowerCase() : "";
  };
  const howPay = answer("how_pay");
  if (/\bcash\b/.test(howPay) || /paying.cash/.test(answer("down_payment"))) return "cash";
  if (/financ|mortgage|loan|hard.money/.test(howPay)) return "financing";
  if (/not.sure/.test(howPay)) return "not_sure";
  return "";
}

function fromBuyerType(buyerType) {
  const t = String(buyerType || "").toLowerCase();
  if (/\bcash\b/.test(t)) return "cash";
  if (t === "financing") return "financing";
  if (/^not.sure/.test(t)) return "not_sure";
  return "";
}

function fundingOf(lead) {
  return (
    FROM_BUY_BOX[lead.buyBox?.financing] ||
    FROM_NEEDS_FINANCING[lead.needsFinancing] ||
    fromAnswers(lead.answers) ||
    fromBuyerType(lead.buyerType) ||
    "unknown"
  );
}

module.exports = { FUNDING, fundingOf };
