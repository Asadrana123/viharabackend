// config/newDeals.js
//
// The /new-deals spotlight deals. These are NOT in the property database yet,
// so this is the backend's copy of NEW_DEALS in the frontend's
// components/Landing/landing.config.js — keep the two in sync (same ids).
// Used to validate deal_interest, label it for Slack / Brevo / admin, and to
// build Maya's CURRENT NEW DEALS block. `slug` ties each deal to its property
// in the database (address, photos, beds/baths for the page's deal cards).
// Maya's prompt stays address-free.
//
// price is the STARTING BID on the live listing (Prajwal, 3 Nov 2026), not the old ad list price.
//
// live: true  → shown on the page and in Maya's CURRENT NEW DEALS block.
// Retired deals stay in the list so older leads that tapped them keep their
// label in admin / Slack / Brevo and Maya can still name the deal on a call.

const NEW_DEALS = [
  { id: "bal-01", slug: "2529-2531-e-monument-st-baltimore", city: "Baltimore", state: "MD", area: "East Baltimore", price: 58687, type: "Mixed-use", fit: "Buy & hold" },
  { id: "pg-01", slug: "703-59th-ave-capitol-heights", city: "Fairmount Heights", state: "MD", area: "Prince George's County", price: 126753, type: "", fit: "Fix & flip" },
  { id: "det-01", slug: "18753-san-diego-blvd-lathrup-village", city: "Lathrup Village", state: "MI", area: "Metro Detroit, Oakland County", price: 259348, type: "", fit: "Buy & hold" },
  { id: "nola-01", live: true, slug: "1983-law-st-new-orleans", city: "New Orleans", state: "LA", area: "Orleans Parish", price: 126477, type: "", fit: "Buy & hold" },
  { id: "nola-02", live: true, slug: "1977-law-st-new-orleans", city: "New Orleans", state: "LA", area: "Orleans Parish", price: 133777, type: "", fit: "Buy & hold" },
  { id: "nola-03", live: true, slug: "2508-12-s-prieur-st-new-orleans", city: "New Orleans", state: "LA", area: "Orleans Parish", price: 257296, type: "Multi-unit", fit: "Multi-unit income" },
];

// Every sign-up from the /new-deals page is tagged with this partner (admin,
// Slack). /find and /request post to the same endpoint and are NOT tagged.
const NEW_DEALS_PARTNER = "Premier Mortgage";

const STATE_WORDS = { MD: "Maryland", MI: "Michigan", LA: "Louisiana" };
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

const LIVE_DEALS = NEW_DEALS.filter((d) => d.live);

const findDeal = (id) => NEW_DEALS.find((d) => d.id === id) || null;

/** "Baltimore, MD · $58,687" — Slack / admin label. */
const dealLabel = (id) => {
  const d = findDeal(id);
  return d ? `${d.city}, ${d.state} · ${usd(d.price)}` : "";
};

/** "the Baltimore, Maryland deal with a starting bid of $58,687" — for Maya. */
const dealSpoken = (id) => {
  const d = findDeal(id);
  return d ? `the ${d.city}, ${STATE_WORDS[d.state] || d.state} deal with a starting bid of ${usd(d.price)}` : "";
};

/** Maya's CURRENT NEW DEALS lines (live deals only, facts only — no addresses). */
const dealsForPrompt = () =>
  LIVE_DEALS.map((d, i) =>
    [
      `${i + 1}) ${d.city}, ${STATE_WORDS[d.state] || d.state} — ${d.area}.`,
      d.type ? `${d.type}.` : "",
      `Starting bid: ${usd(d.price)}.`,
      `Best for ${d.fit.replace("&", "and").toLowerCase()}.`,
    ]
      .filter(Boolean)
      .join(" ")
  ).join("\n");

module.exports = { NEW_DEALS_PARTNER, NEW_DEALS, LIVE_DEALS, findDeal, dealLabel, dealSpoken, dealsForPrompt };
