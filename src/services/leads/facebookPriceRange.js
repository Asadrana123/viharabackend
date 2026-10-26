// services/leads/facebookPriceRange.js
//
// The price-range answer on a Facebook / Instagram form lead, as the buyer saw it. Used by the
// intro-text script and by the Leads tab's "Text this lead" ({{price_range}} in a Vtext template).

const CONTACT_KEYS = /^(full_name|first_name|last_name|email|phone_number|phone)$/;

/** The price-range answer's label (falls back to the raw value only if it is itself a $ figure); null when there is none. */
function priceRangeOf(lead) {
  const a = (lead.answers || []).find((x) => !CONTACT_KEYS.test(x.key) && /price|budget|range/i.test(x.key));
  if (!a) return null;
  const label = String(a.label || "").trim();
  if (label) return label;
  const value = String(a.value || "").trim();
  return value.includes("$") ? value : null;
}

module.exports = { CONTACT_KEYS, priceRangeOf };
