// config/newDeals.js
//
// The /new-deals spotlight deals. These are NOT in the property database yet,
// so this is the backend's copy of NEW_DEALS in the frontend's
// components/Landing/landing.config.js — keep the two in sync (same ids).
// Used to validate deal_interest, label it for Slack / Brevo / admin, and to
// build Maya's CURRENT NEW DEALS block. `slug` ties each deal to its property
// in the database (address, photos, beds/baths for the page's deal cards).
// Maya's prompt stays address-free.

const NEW_DEALS = [
  { id: "bal-01", slug: "2529-2531-e-monument-st-baltimore", city: "Baltimore", state: "MD", area: "East Baltimore", price: 65900, type: "Mixed-use", fit: "Buy & hold" },
  { id: "pg-01", slug: "703-59th-ave-capitol-heights", city: "Fairmount Heights", state: "MD", area: "Prince George's County", price: 139900, type: "", fit: "Fix & flip" },
  { id: "det-01", slug: "18753-san-diego-blvd-lathrup-village", city: "Lathrup Village", state: "MI", area: "Metro Detroit, Oakland County", price: 285000, type: "", fit: "Buy & hold" },
  { id: "nola-01", slug: "1983-law-st-new-orleans", city: "New Orleans", state: "LA", area: "Orleans Parish", price: 139900, type: "", fit: "Buy & hold" },
  { id: "nola-02", slug: "1977-law-st-new-orleans", city: "New Orleans", state: "LA", area: "Orleans Parish", price: 149900, type: "", fit: "Buy & hold" },
  { id: "nola-03", slug: "2508-12-s-prieur-st-new-orleans", city: "New Orleans", state: "LA", area: "Orleans Parish", price: 265500, type: "Multi-unit", fit: "Multi-unit income" },
];

const STATE_WORDS = { MD: "Maryland", MI: "Michigan", LA: "Louisiana" };
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

const findDeal = (id) => NEW_DEALS.find((d) => d.id === id) || null;

/** "Baltimore, MD · $65,900" — Slack / admin label. */
const dealLabel = (id) => {
  const d = findDeal(id);
  return d ? `${d.city}, ${d.state} · ${usd(d.price)}` : "";
};

/** "the Baltimore, Maryland deal listed at $65,900" — for Maya. */
const dealSpoken = (id) => {
  const d = findDeal(id);
  return d ? `the ${d.city}, ${STATE_WORDS[d.state] || d.state} deal listed at ${usd(d.price)}` : "";
};

/** Maya's CURRENT NEW DEALS lines (facts only — no addresses). */
const dealsForPrompt = () =>
  NEW_DEALS.map((d, i) =>
    [
      `${i + 1}) ${d.city}, ${STATE_WORDS[d.state] || d.state} — ${d.area}.`,
      d.type ? `${d.type}.` : "",
      `List price: ${usd(d.price)}.`,
      `Best for ${d.fit.replace("&", "and").toLowerCase()}.`,
    ]
      .filter(Boolean)
      .join(" ")
  ).join("\n");

module.exports = { NEW_DEALS, findDeal, dealLabel, dealSpoken, dealsForPrompt };
